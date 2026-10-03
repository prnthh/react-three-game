import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Layers } from 'three';
import { hideInstancedSources } from '../../src/runtime/rendering/MeshInstanceProvider.tsx';

test('changing editor handlers preserves instance batches and uses the current handler', async t => {
    const { act, createElement: h, useRef } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { InstancedMesh } = await import('three');
    const { MeshInstanceProvider, useMeshInstanceRegistration, useMeshInstanceRevision } = await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    const { EditPickContext } = await import('../../src/runtime/scene/SelectionRuntime.tsx');
    extend({ Group, Mesh, InstancedMesh }); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    geometry.userData.prefabGeometrySignature = 'handler-continuity';
    const meshes = [new Mesh(geometry, material), new Mesh(geometry, material)];
    let revision, store;
    function Probe() { revision = useMeshInstanceRevision(); return null; }
    let sourceRenders = 0;
    function Source({ mesh }) {
        sourceRenders++;
        const ref = useRef(null);
        useMeshInstanceRegistration(mesh.uuid, ref, true);
        return h('mesh', { ref, geometry: mesh.geometry, material: mesh.material });
    }
    const render = async handler => act(async () => {
        store = root.render(h(MeshInstanceProvider, null, h(Probe),
            h(EditPickContext.Provider, { value: handler }, meshes.map(mesh => h(Source, { key: mesh.uuid, mesh })))));
    });
    t.after(async () => { await act(async () => root.unmount()); geometry.dispose(); material.dispose(); });
    let clicks = 0;
    await render(() => { clicks++; });
    assert.equal(sourceRenders, 2, 'refs register both meshes without a second render');
    const originalRevision = revision;
    const batch = store.getState().scene.children.find(object => object.isInstancedMesh);
    for (const handler of [undefined, () => { clicks += 10; }]) {
        await render(handler);
        assert.equal(revision, originalRevision, 'no unregister/register cycle');
        assert.ok(store.getState().scene.children.includes(batch));
        batch.__r3f.handlers.onClick({ delta: 0, instanceId: 0 });
    }
    assert.equal(clicks, 10, 'play ignores edit clicks; edit uses the new handler');
});

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
    const {act,createElement:h,useRef}=await import('react');
    const {createRoot,extend}=await import('@react-three/fiber');
    const {InstancedMesh,Matrix4}=await import('three');
    const {MeshInstanceProvider,useMeshInstanceRegistration}=await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    extend({Group,Mesh,InstancedMesh});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    const geometry=new BoxGeometry(),material=new MeshBasicMaterial();geometry.userData.prefabGeometrySignature='reflection-test';
    const a=new Mesh(geometry,material),b=new Mesh(geometry,material);b.scale.x=-1;
    function Source({id,mesh}){useMeshInstanceRegistration(id,useRef(mesh),true);return h('primitive',{object:mesh});}
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
