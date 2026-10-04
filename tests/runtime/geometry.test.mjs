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
