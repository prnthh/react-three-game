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

test('instancing shader factories stay out of material serialization and clones', async () => {
    const { registerInstancedMaterial, getInstancedMaterialFactory } = await import('../../src/runtime/rendering/materialInstancing.ts');
    const source = new MeshBasicMaterial({color:'#123456'});
    source.userData = {label:'authored'};
    const before = JSON.stringify(source.toJSON());
    const inverse = {};
    registerInstancedMaterial(source, matrix => {
        assert.strictEqual(matrix, inverse);
        return source.clone();
    });
    const variant = getInstancedMaterialFactory(source)(inverse);
    assert.notStrictEqual(variant, source);
    assert.equal(variant.color.getHex(), source.color.getHex());
    assert.equal(JSON.stringify(source.toJSON()), before);
    assert.equal(getInstancedMaterialFactory(variant), undefined);
    assert.equal(getInstancedMaterialFactory([source]), undefined);
    variant.color.set('#ffffff');
    assert.equal(source.color.getHexString(), '123456');
    variant.dispose(); source.dispose();
});

test('reflected instance transforms retain ordinary rendering and restore custom layer masks', async () => {
    const {Matrix4}=await import('three');
    const {supportsInstanceMatrix,manageInstancedSourceVisibility}=await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    const mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());
    mesh.layers.set(3);
    const visibility=manageInstancedSourceVisibility([{id:'mirrored-rubble',mesh}]);
    const regular=new Matrix4().makeScale(2,1,3), mirrored=new Matrix4().makeScale(-2,1,3);
    assert.equal(supportsInstanceMatrix(regular),true);
    assert.equal(supportsInstanceMatrix(mirrored),false);
    assert.equal(supportsInstanceMatrix(new Matrix4().makeScale(-2,-1,3)),true,'two reflections preserve winding');
    assert.equal(supportsInstanceMatrix(new Matrix4().makeScale(0,1,1)),false);
    for(const matrix of [regular,mirrored,regular,mirrored]){
        visibility.setBatched(0,supportsInstanceMatrix(matrix));
        assert.equal(mesh.layers.mask,matrix===regular?0:8);
    }
    visibility.restore();assert.equal(mesh.layers.mask,8);
    mesh.geometry.dispose();mesh.material.dispose();
});

test('mounted batches hide reflected slots and render their sources across live scale changes', async t => {
    const {act,createElement:h}=await import('react');
    const {createRoot,extend}=await import('@react-three/fiber');
    const {InstancedMesh,Matrix4}=await import('three');
    const {MeshInstanceProvider,useMeshInstanceRegistration}=await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    extend({Group,Mesh,InstancedMesh});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    const geometry=new BoxGeometry(),material=new MeshBasicMaterial();geometry.userData.prefabGeometrySignature='reflection-test';
    const a=new Mesh(geometry,material),b=new Mesh(geometry,material);b.scale.x=-1;
    function Source({id,mesh}){useMeshInstanceRegistration(id,mesh,true);return h('primitive',{object:mesh});}
    let store;await act(async()=>{store=root.render(h(MeshInstanceProvider,null,h(Source,{id:'a',mesh:a}),h(Source,{id:'b',mesh:b})));});
    t.after(async()=>{await act(async()=>root.unmount());geometry.dispose();material.dispose();});
    const batch=store.getState().scene.children.find(o=>o.isInstancedMesh);assert.ok(batch);
    const matrix=new Matrix4();
    assert.equal(a.layers.mask,0);assert.equal(b.layers.mask,1);
    batch.getMatrixAt(1,matrix);assert.equal(matrix.determinant(),0,'reflected slot must not draw');
    b.scale.x=1;await act(async()=>store.getState().advance(1,false));
    assert.equal(b.layers.mask,0);batch.getMatrixAt(1,matrix);assert.ok(matrix.determinant()>0);
    b.scale.x=-1;await act(async()=>store.getState().advance(2,false));
    assert.equal(b.layers.mask,1);batch.getMatrixAt(1,matrix);assert.equal(matrix.determinant(),0);
    await act(async()=>root.render(null));assert.equal(a.layers.mask,1);assert.equal(b.layers.mask,1);
});
