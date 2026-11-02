import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';

test('batch cells handle negative boundaries and stale registration cleanup', async t => {
    const { MeshInstanceRegistry } = await import('../../src/runtime/rendering/MeshInstanceRuntime.ts');
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), root = new Group();
    geometry.userData.prefabGeometrySignature = 'cell-boundary';
    const registry = new MeshInstanceRegistry(false, 10), disconnect = registry.connect(root);
    t.after(() => { disconnect(); geometry.dispose(); material.dispose(); });
    const meshes = [-0.01, -1, 0, 1].map(x => {
        const mesh = new Mesh(geometry, material); mesh.position.x = x; return mesh;
    });
    const source = { id: 'replaced', mesh: meshes[0] };
    const old = registry.register(source), current = registry.register(source);
    const cleanup = meshes.slice(1).map(mesh => registry.register({ id: mesh.uuid, mesh }));
    old();
    registry.update();
    assert.deepEqual(root.children.map(batch => batch.count), [2, 2], 'negative and nonnegative positions occupy different cells');
    meshes[0].position.x = 0;
    registry.update();
    assert.deepEqual(root.children.map(batch => batch.count), [3], 'crossing zero migrates into the neighboring batch');
    assert.equal(meshes[1].layers.mask, 1, 'the negative singleton returns to ordinary rendering');
    current(); cleanup.forEach(remove => remove()); registry.update();
    assert.equal(root.children.length, 0);
    assert.ok(meshes.every(mesh => mesh.layers.mask === 1));
    for (const size of [0, -1, Infinity, NaN]) assert.throws(() => new MeshInstanceRegistry(false, size));
});

test('spatial batches split distant peers, retain oversized bounds and migrate moving nodes', async t => {
    const {act,createElement:h,useRef,Profiler}=await import('react');
    const {createRoot,extend}=await import('@react-three/fiber');
    const {InstancedMesh,Vector3}=await import('three');
    const {MeshInstanceProvider,useMeshInstanceRegistration}=await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    const { ChunkSettingsContext } = await import('../../src/runtime/components/ChunkSettingsComponent.tsx');
    extend({Group,Mesh,InstancedMesh});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    const geometry=new BoxGeometry(),material=new MeshBasicMaterial();geometry.userData.prefabGeometrySignature='spatial-test';
    const meshes=[0,1,100,101].map(x=>{const mesh=new Mesh(geometry,material);mesh.position.x=x;return mesh;});
    meshes[0].scale.x=80;
    function Source({mesh}){useMeshInstanceRegistration(mesh.uuid,useRef(mesh),true);return h('primitive',{object:mesh});}
    let commits=0;
    let store;await act(async()=>{store=root.render(h(Profiler,{id:'batches',onRender:()=>commits++},h(ChunkSettingsContext.Provider,{value:{batchCellSize:10}},h(MeshInstanceProvider,null,...meshes.map(mesh=>h(Source,{key:mesh.uuid,mesh}))))));});
    t.after(async()=>{await act(async()=>root.unmount());geometry.dispose();material.dispose();});
    const batches=()=>{const result=[];store.getState().scene.traverse(o=>{if(o.isInstancedMesh) result.push(o);});return result;};
    assert.equal(batches().length,0,'mounting registers sources; a rendering frame builds batches');
    await act(async()=>store.getState().advance(0,false));
    assert.equal(batches().length,2);
    assert.ok(batches().every(batch=>batch.frustumCulled && batch.count===2));
    assert.ok(batches().some(batch=>batch.boundingSphere.containsPoint(new Vector3(-40,0,0))), 'bounds include geometry outside its cell');
    meshes[1].position.x=102;
    const previousCommits=commits;
    await act(async()=>store.getState().advance(1,false));
    assert.equal(commits,previousCommits,'cell migration updates GPU batches without a React commit');
    assert.equal(batches().length,1);
    assert.equal(batches()[0].count,3);
    assert.equal(meshes[0].layers.mask,1,'singleton returns to ordinary rendering');
    assert.equal(meshes[1].layers.mask,0,'moved source belongs to new batch');
    assert.ok(batches()[0].boundingSphere.containsPoint(new Vector3(102,0,0)));
    await act(async()=>root.render(null));
    assert.ok(meshes.every(mesh=>mesh.layers.mask===1),'cleanup restores all source meshes');
});

test('imperative batches retain GPU identity, edit picking, and ownership across incremental changes', async () => {
    const { MeshInstanceRegistry } = await import('../../src/runtime/rendering/MeshInstanceRuntime.ts');
    const { resolveRenderSource } = await import('../../src/runtime/scene/gameObject.ts');
    const { Matrix4 } = await import('three');
    const scene = new Group(), container = new Group(); scene.add(container);
    container.position.x = 5;
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    geometry.userData.prefabGeometrySignature = 'retained';
    let sourceDisposals = 0;
    geometry.addEventListener('dispose',()=>sourceDisposals++);
    material.addEventListener('dispose',()=>sourceDisposals++);
    const registry = new MeshInstanceRegistry(false, 10);
    const disconnect = registry.connect(container);
    const clicks = [];
    const meshes = [0,1,2,3,100,101].map(x=>{const mesh=new Mesh(geometry,material);mesh.position.x=x;scene.add(mesh);return mesh;});
    const register = mesh => registry.register({id:mesh.uuid,mesh,onClick:()=>clicks.push(mesh)});
    const cleanup = [0,1,2,4,5].map(i=>register(meshes[i]));
    registry.update();
    const [near,far] = container.children;
    const addFourth = register(meshes[3]); registry.update();
    assert.equal(container.children[0],near,'grow within allocated capacity without recreating the mesh');
    assert.equal(container.children[1],far,'an unrelated batch keeps its identity');
    assert.equal(near.count,4);
    registry.handleClick({object:near,instanceId:3,delta:0});
    assert.equal(clicks[0],meshes[3]);
    assert.equal(resolveRenderSource(near,3),meshes[3]);
    const matrix = new Matrix4(); near.getMatrixAt(0,matrix);
    assert.equal(matrix.elements[12],-5,'instance matrices account for the batch parent transform');
    meshes[0].scale.x=-1; registry.update();
    assert.equal(meshes[0].layers.mask,1,'reflections retain ordinary rendering');
    near.getMatrixAt(0,matrix); assert.equal(matrix.determinant(),0);
    addFourth(); registry.update();
    assert.equal(container.children[0],near,'shrinking a batch retains its GPU allocation');
    assert.equal(near.count,3);
    let disposed=0;near.addEventListener('dispose',()=>disposed++);
    cleanup.forEach(remove=>remove()); registry.update();
    assert.equal(container.children.length,0); assert.equal(disposed,1);
    assert.ok(meshes.every(mesh=>mesh.layers.mask===1));
    assert.equal(sourceDisposals,0,'batch disposal must not free shared geometry or materials');
    disconnect(); await Promise.resolve(); geometry.dispose(); material.dispose();
});

test('instance material variants are released when the provider disconnects', async () => {
    const { MeshInstanceRegistry } = await import('../../src/runtime/rendering/MeshInstanceRuntime.ts');
    const { registerInstancedMaterial } = await import('../../src/runtime/rendering/materialInstancing.ts');
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), root = new Group();
    geometry.userData.prefabGeometrySignature='custom';
    let variants=0,disposed=0;
    registerInstancedMaterial(material,()=>{
        variants++;const variant=new MeshBasicMaterial();variant.addEventListener('dispose',()=>disposed++);return variant;
    });
    const registry=new MeshInstanceRegistry(false,24), disconnect=registry.connect(root);
    const meshes=[new Mesh(geometry,material),new Mesh(geometry,material)];
    meshes.forEach(mesh=>registry.register({id:mesh.uuid,mesh}));registry.update();
    assert.equal(variants,1);
    registry.invalidate();registry.update();assert.equal(variants,1,'unrelated invalidations reuse the shader variant');
    disconnect();assert.equal(disposed,1);assert.ok(meshes.every(mesh=>mesh.layers.mask===1));
    await Promise.resolve();geometry.dispose();material.dispose();
});

test('nested prefabs share automatic batches while capture scenes own separate batches', async t => {
    const { act, createElement: h, useRef } = await import('react');
    const { createRoot, createPortal } = await import('@react-three/fiber');
    const { Scene } = await import('three');
    const { MeshInstanceProvider, useMeshInstanceRegistration } = await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas), captureScene = new Scene();
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    geometry.userData.prefabGeometrySignature = 'shared-across-scenes';
    const main = [new Mesh(geometry, material), new Mesh(geometry, material)];
    const capture = [new Mesh(geometry, material), new Mesh(geometry, material)];
    t.after(async () => { await act(async () => root.unmount()); geometry.dispose(); material.dispose(); });
    function Source({ mesh }) {
        useMeshInstanceRegistration(mesh.uuid, useRef(mesh), true);
        return h('primitive', { object: mesh });
    }
    let store;
    await act(async () => { store = root.render(h(MeshInstanceProvider, null,
        h(Source, { mesh: main[0] }), h(MeshInstanceProvider, null, h(Source, { mesh: main[1] })),
        createPortal(h(MeshInstanceProvider, { isolated: true }, capture.map(mesh => h(Source, { key: mesh.uuid, mesh }))), captureScene),
    )); });
    const batches = scene => { const found = []; scene.traverse(object => { if (object.isInstancedMesh) found.push(object); }); return found; };
    assert.equal(batches(store.getState().scene).length, 0);
    assert.equal(batches(captureScene).length, 0);
    await act(async () => store.getState().advance(1, false));
    assert.equal(batches(store.getState().scene).length, 1);
    assert.equal(batches(captureScene).length, 1);
    assert.equal(batches(store.getState().scene)[0].count, 2);
    assert.equal(batches(captureScene)[0].count, 2);
    assert.ok([...main, ...capture].every(mesh => mesh.layers.mask === 0));
    assert.ok(main.every(mesh => mesh.parent === store.getState().scene), 'batching keeps source geometry in place for picking and colliders');
    await act(async () => root.render(null));
    assert.ok([...main, ...capture].every(mesh => mesh.layers.mask === 1));
});
