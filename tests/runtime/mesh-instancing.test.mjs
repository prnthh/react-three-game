import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Layers } from 'three';
import { hideInstancedSources } from '../../src/runtime/rendering/MeshInstanceProvider.tsx';

test('instancing preserves source geometry for collider rebuilding and restores rendering on cleanup', () => {
    const node = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 0.1, 2), new MeshBasicMaterial());
    node.add(mesh);
    const restore = hideInstancedSources([{id:'lift', mesh}]);
    assert.equal(mesh.parent, node);
    const geometry = [];
    node.traverse(object => { if (object.geometry) geometry.push(object.geometry); });
    assert.deepEqual(geometry, [mesh.geometry]);
    assert.equal(mesh.layers.test(new Layers()), false, 'source does not draw alongside its batch');
    restore();
    assert.equal(mesh.layers.test(new Layers()), true);
    assert.equal(mesh.parent, node);
    mesh.geometry.dispose();
    mesh.material.dispose();
});

test('spatial batches split distant peers, retain oversized bounds and migrate moving nodes', async t => {
    const {act,createElement:h,useRef}=await import('react');
    const {createRoot,extend}=await import('@react-three/fiber');
    const {InstancedMesh,Vector3}=await import('three');
    const {MeshInstanceProvider,SpatialCellSizeContext,useMeshInstanceRegistration}=await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    extend({Group,Mesh,InstancedMesh});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    const geometry=new BoxGeometry(),material=new MeshBasicMaterial();geometry.userData.prefabGeometrySignature='spatial-test';
    const meshes=[0,1,100,101].map(x=>{const mesh=new Mesh(geometry,material);mesh.position.x=x;return mesh;});
    meshes[0].scale.x=80;
    function Source({mesh}){useMeshInstanceRegistration(mesh.uuid,useRef(mesh),true);return h('primitive',{object:mesh});}
    let store;await act(async()=>{store=root.render(h(SpatialCellSizeContext.Provider,{value:10},h(MeshInstanceProvider,null,...meshes.map(mesh=>h(Source,{key:mesh.uuid,mesh})))));});
    t.after(async()=>{await act(async()=>root.unmount());geometry.dispose();material.dispose();});
    const batches=()=>store.getState().scene.children.filter(o=>o.isInstancedMesh);
    assert.equal(batches().length,2);
    assert.ok(batches().every(batch=>batch.frustumCulled && batch.count===2));
    assert.ok(batches().some(batch=>batch.boundingSphere.containsPoint(new Vector3(-40,0,0))), 'bounds include geometry outside its cell');
    meshes[1].position.x=102;
    await act(async()=>store.getState().advance(1,false));
    assert.equal(batches().length,1);
    assert.equal(batches()[0].count,3);
    assert.equal(meshes[0].layers.mask,1,'singleton returns to ordinary rendering');
    assert.equal(meshes[1].layers.mask,0,'moved source belongs to new batch');
    assert.ok(batches()[0].boundingSphere.containsPoint(new Vector3(102,0,0)));
    await act(async()=>root.render(null));
    assert.ok(meshes.every(mesh=>mesh.layers.mask===1),'cleanup restores all source meshes');
});
