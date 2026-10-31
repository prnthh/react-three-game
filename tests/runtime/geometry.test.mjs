import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, BoxGeometry, Group, Mesh } from 'three';
import Geometry, { applyGeometryModifiers, getGeometryModifiers } from '../../src/runtime/components/GeometryComponent.tsx';
import { registerComponent, canAddComponentToNode } from '../../src/core/ComponentRegistry.ts';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';

const ScaleComponent = {
 name: 'TestScale',
 properties: { x: { default: 1 }, y: { default: 1 }, z: { default: 1 } },
 modifyGeometry: (source, { x = 1, y = 1, z = 1 }) => source.clone().scale(x, y, z),
};
registerComponent(Geometry);registerComponent(ScaleComponent);
extend({Group,Mesh});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const geometry={type:'Geometry',properties:{geometryType:'box',args:[2,3,4,3,4,5]}};
const scale={type:'TestScale',properties:{x:1.2}};

async function mountRoot(t) {
 const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
 const root=createRoot(canvas);
 await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
 t.after(async()=>{await act(async()=>root.unmount());});
 return root;
}

test('geometry: modifiers, live updates, transforms and shared ownership', async t => {
    await t.test('a custom modifier composes with primitive geometry, independent of material and component key',()=>{
     const node={id:'box',components:{shape:geometry,modifier:scale}};
     assert.equal(canAddComponentToNode({id:'base',components:{shape:geometry}},ScaleComponent),true);
     const source=new BoxGeometry(2,3,4,3,4,5);
     const before=source.attributes.position.array.slice();
     const modifiers=getGeometryModifiers(node);
     const result=applyGeometryModifiers(source,modifiers);
     assert.notEqual(result,source);
     assert.deepEqual(source.attributes.position.array,before);
     assert.equal(getGeometryModifiers({id:'plain',components:{shape:geometry}}).length,0);
     assert.equal(modifiers[0].properties.y,1,'uses registry defaults');
     source.dispose();result.dispose();
    });

    await t.test('geometry modifiers update immediately, stay node-local and restore the shared base when removed',async t=>{
     const previousWindow=globalThis.window;
     globalThis.window={addEventListener(){},removeEventListener(){}};
     AudioContext.setContext({createGain:()=>({connect(){}}),destination:{},listener:{}});
     const root=await mountRoot(t);
     t.after(()=>{globalThis.window=previousWindow;});
     const doc=createPrefabStore({root:{id:'world',children:[
      {id:'a',name:'a',components:{shape:geometry},children:[{id:'child',name:'child',components:{shape:geometry}}]},
      {id:'b',name:'b',components:{shape:geometry}},
     ]}});
     let store;await act(async()=>{store=root.render(h(PrefabRoot,{store:doc,editMode:true}));});
     const find=name=>store.getState().scene.getObjectByName(name).children.find(o=>o.isMesh);
     const a=find('a'),b=find('b'),child=find('child'),base=a.geometry;
     assert.equal(base.attributes.position.count,new BoxGeometry(2,3,4,3,4,5).attributes.position.count,'subdivisions retained');
     assert.equal(b.geometry,base);
     const update=async components=>act(async()=>doc.getState().updateNode('a',n=>({...n,components:{shape:geometry,...components}})));
     await update({modifier:scale});
     assert.equal(find('a'),a,'no mesh remount');
     assert.notEqual(a.geometry,base);
     assert.equal(b.geometry,base);assert.equal(child.geometry,base,'does not leak to descendants');
     const scaled=a.geometry;
     await update({modifier:{...scale,properties:{...scale.properties,x:1.5}}});
     assert.notEqual(a.geometry,scaled);
     assert.notDeepEqual(a.geometry.attributes.position.array,scaled.attributes.position.array);
     await update({});assert.equal(a.geometry,base,'removing modifier restores base without reset');
    });

});

test('box UV mapping preserves source geometry and uses surface dimensions and authored scale', async () => {
 const { default: UVMapping } = await import('../../src/runtime/components/UVMappingComponent.ts');
 const source = new BoxGeometry(2, 4, 6);
 const original = source.attributes.uv.array.slice();
 const mapped = UVMapping.modifyGeometry(source, { unitsPerTile: 2 }, { scale: [1, 2, 1] });
 assert.deepEqual(source.attributes.uv.array, original);
 const uv = mapped.attributes.uv;
 // +X face is 6 units wide and 8 units tall after authored scale.
 const us = [0,1,2,3].map(i => uv.getX(i)), vs = [0,1,2,3].map(i => uv.getY(i));
 assert.equal(Math.max(...us)-Math.min(...us), 3);
 assert.equal(Math.max(...vs)-Math.min(...vs), 4);
 assert.deepEqual(mapped.attributes.position.array, source.attributes.position.array);
 source.dispose(); mapped.dispose();
});

test('projected decals clip curved parent meshes, preserve sources and follow transformed parents', async t => {
 const { registerGameObjectOwner } = await import('../../src/runtime/scene/gameObject.ts');
 const { SphereGeometry, Vector3 } = await import('three');
 const { getDecalTargets, projectDecalGeometry } = await import('../../src/runtime/components/DecalComponent.tsx');
 const parent = new Group(), target = new Mesh(new SphereGeometry(2, 32, 24));
 parent.add(target);
 const projector = new Group();
 t.after(registerGameObjectOwner(projector, { id: 'decal', nodeId: 'decal', scope: '' }));
 projector.position.z = 1.95; parent.add(projector);
 // Another authored child and the decal itself must not become projection targets.
 projector.add(new Mesh(new BoxGeometry()));
 const child = new Group();
 t.after(registerGameObjectOwner(child, { id: 'separate-object', nodeId: 'separate-object', scope: '' }));
 child.add(new Mesh(new BoxGeometry())); parent.add(child);
 assert.deepEqual(getDecalTargets(parent), [target]);
 const original = target.geometry.attributes.position.array.slice();
 const decal = projectDecalGeometry([target], projector, [2, 2, 0.8]);
 const vertices = decal.attributes.position;
 assert.ok(vertices.count > 6, 'real clipped mesh triangles rather than a plane');
 let minZ = Infinity, maxZ = -Infinity;
 for (let i = 0; i < vertices.count; i++) {
  const p = new Vector3().fromBufferAttribute(vertices, i);
  assert.ok(Math.abs(p.x) <= 1.00001 && Math.abs(p.y) <= 1.00001 && Math.abs(p.z) <= 0.40001);
  minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
 }
 assert.ok(maxZ - minZ > 0.2, 'decal conforms to the curved surface');
 parent.position.set(7, 2, -4); parent.rotation.set(0.3, 0.7, 0.1); parent.scale.set(2, 0.8, 1.3);
 const moved = projectDecalGeometry([target], projector, [2, 2, 0.8]);
 // Clipping can produce extra zero-area triangles at floating-point boundary crossings.
 const area = geometry => {
  const p = geometry.attributes.position, a = new Vector3(), b = new Vector3(), c = new Vector3();
  let sum = 0;
  for (let i = 0; i < p.count; i += 3) {
   a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
   sum += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return sum;
 };
 decal.computeBoundingBox(); moved.computeBoundingBox();
 assert.ok(decal.boundingBox.min.distanceTo(moved.boundingBox.min) < 1e-5);
 assert.ok(decal.boundingBox.max.distanceTo(moved.boundingBox.max) < 1e-5);
 assert.ok(Math.abs(area(decal) - area(moved)) < 1e-5);
 assert.deepEqual(target.geometry.attributes.position.array, original);
 projector.position.z = 8;
 const miss = projectDecalGeometry([target], projector, [2, 2, 0.8]);
 assert.equal(miss.attributes.position.count, 0, 'no floating plane when projector misses');
 for (const geometry of [target.geometry, decal, moved, miss]) geometry.dispose();
});

test('decal component resolves its scene parent and updates projection without remounting', async t => {
 const { default: Decal } = await import('../../src/runtime/components/DecalComponent.tsx');
 registerComponent(Decal);
 const previousWindow = globalThis.window;
 globalThis.window = { addEventListener(){}, removeEventListener(){} };
 AudioContext.setContext({createGain:()=>({connect(){}}),destination:{},listener:{}});
 t.after(() => { globalThis.window = previousWindow; });
 const root = await mountRoot(t);
 const doc = createPrefabStore({root:{id:'parent',name:'parent',components:{shape:geometry},children:[
  {id:'mark',name:'mark',components:{transform:{type:'Transform',properties:{position:[0,0,2]}},decal:{type:'Decal',properties:{size:[1,1,0.3]}}}},
 ]}});
 let store;
 await act(async()=>{store=root.render(h(PrefabRoot,{store:doc,editMode:true}));});
 const mark = store.getState().scene.getObjectByName('mark').children.find(o=>o.isMesh);
 assert.ok(mark.geometry.attributes.position.count > 0, 'projects after mount, even without GPU frames');
 const parent = store.getState().scene.getObjectByName('parent');
 const target = parent.children.find(o => o.isMesh);
 const originalPositions = target.geometry.getAttribute('position');
 const replacement = originalPositions.clone();
 for (let i = 0; i < replacement.count; i++) replacement.setX(i, replacement.getX(i) + 20);
 target.geometry.setAttribute('position', replacement);
 store.getState().advance(0.1, false);
 assert.equal(mark.geometry.attributes.position.count, 0, 'replacing a buffer also invalidates projection when its version is unchanged');
 target.geometry.setAttribute('position', originalPositions);
 store.getState().advance(0.2, false);
 assert.ok(mark.geometry.attributes.position.count > 0);
 const first = mark.geometry;
 parent.position.set(4, 2, -3); parent.rotation.y = 0.6;
 store.getState().advance(0.5, false);
 assert.equal(mark.geometry, first, 'moving the whole parent retains the projection');
 store.getState().advance(0.6, false);
 assert.equal(mark.geometry, first, 'unchanged frames do not recreate geometry');
 let disposed = false; first.addEventListener('dispose',()=>{disposed=true;});
 await act(async()=>doc.getState().updateNode('mark',n=>({...n,components:{...n.components,transform:{type:'Transform',properties:{position:[0,0,20]}}}})));
 store.getState().advance(1, false);
 assert.equal(mark.geometry.attributes.position.count,0);
 assert.ok(disposed, 'old projection geometry is released');
 assert.equal(store.getState().scene.getObjectByName('mark').children.find(o=>o.isMesh), mark);
});
