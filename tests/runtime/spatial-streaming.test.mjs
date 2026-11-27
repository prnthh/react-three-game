import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { registerBuiltInComponents } from '../../src/runtime/components/index.ts';
registerBuiltInComponents();
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createSpatialPrefabPlan } from '../../src/runtime/prefabs/spatialPrefabPlan.ts';
import { looseOctreeKey } from '../../src/runtime/spatial/spatialCell.ts';
import { buildChunkTree } from '../../src/runtime/spatial/chunkTree.ts';
import { registerChunkDraws } from '../../src/runtime/rendering/chunkFrustum.ts';
import { SpatialStreamScheduler } from '../../src/runtime/prefabs/SpatialStreamScheduler.ts';

const component = (type, properties = {}) => ({ type, properties });
const box = (id, position, material = {}) => ({ id, name: id, components: {
    transform: component('Transform', { position }), geometry: component('Geometry', { geometryType: 'box' }),
    material: component('Material', material),
} });
const state = children => normalizePrefab({ root: { id: 'world', children } });
const runtime = { getPrefab: () => null };
const components = document => Object.values(document.nodesById).flatMap(n => Object.values(n.components ?? {}));

test('streamed bounds contain the rendered vertices for signed primitive radii', async () => {
    const { CylinderGeometry, TorusGeometry } = await import('three');
    for (const [type, args, Geometry] of [['cylinder', [-6, 2, 4], CylinderGeometry], ['torus', [4, -2], TorusGeometry]]) {
        const node = box(type, [0, 0, 0]);
        node.components.geometry.properties = { geometryType: type, args };
        const plan = await createSpatialPrefabPlan(state([node]), runtime);
        const geometry = new Geometry(...args);
        geometry.computeBoundingBox();
        assert.ok(plan.chunks[0].bounds.containsBox(geometry.boundingBox), type);
        geometry.dispose();
    }
});

test('spatial planning retains named references, preserves transforms and bounds oversized geometry', async () => {
    const floor = box('long-floor', [500, 0, 0]);
    floor.components.transform.properties.scale = [1200, 1, 10];
    const source = state([box('definition', [1000, 0, 0], { name: 'shared', color: '#abc123' }),
        { id: 'rotated', components: { transform: component('Transform', { position: [10, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 3, 1] }) }, children: [box('near', [2, 0, 0], { name: 'shared' })] }, floor, box('duplicate', [1100, 0, 0], { name: 'shared', color: '#ffffff' })]);
    const before = JSON.stringify(source);
    const plan = await createSpatialPrefabPlan(source, { ...runtime, batchPrimitives: false }, { cellSize: 32, maxNodesPerChunk: 12 });
    assert.equal(await createSpatialPrefabPlan(source, runtime, { cellSize: 32, maxNodesPerChunk: 12 }), plan);
    assert.notEqual(await createSpatialPrefabPlan(source, runtime, { cellSize: 64, maxNodesPerChunk: 12 }), plan);
    assert.ok(plan.chunks.every(chunk => chunk.cullable), 'ordinary primitives can be culled with instancing disabled');
    assert.equal(JSON.stringify(source), before, 'planning cannot mutate the shared loaded definition');
    const near = plan.chunks.find(c => Object.values(c.document.nodesById).some(n => n.name === 'near'));
    assert.ok(near);
    assert.deepEqual(components(near.document).find(c => c.type === 'Material').properties, { name: 'shared' });
    assert.deepEqual([...plan.materials], [['shared', { color: '#abc123' }]]);
    assert.ok(near.bounds.min.distanceTo(new Vector3(8.5, 3, -0.5)) < 1e-9);
    assert.ok(near.bounds.max.distanceTo(new Vector3(11.5, 5, 0.5)) < 1e-9);
    const long = plan.chunks.find(c => Object.values(c.document.nodesById).some(n => n.name === 'long-floor'));
    assert.equal(long.bounds.distanceToPoint(new Vector3()), 0, 'a distant center must not hide a mesh extending to the camera');
    assert.ok(plan.chunks.every(c => Object.keys(c.document.nodesById).length <= 12));
    for (const chunk of plan.chunks) {
        const ids = Object.keys(chunk.document.nodesById);
        assert.equal(ids.length, new Set(ids).size);
    }
});

test('external and packed references expand with distinct placement transforms and stable plans', async () => {
    const habitat = state([box('bay', [2, 0, 0], { name: 'concrete', color: '#888888' })]);
    const inline = { id: 'inline-kit', packed: true, components: { transform: component('Transform', { position: [3, 0, 0] }) }, children: [box('inline-bay', [1, 0, 0])] };
    const source = state([
        { id: 'a', components: { transform: component('Transform', { position: [100, 0, 0] }), ref: component('PrefabRef', { url: '/habitat.json' }) } },
        { id: 'b', components: { transform: component('Transform', { position: [-100, 0, 0] }), ref: component('PrefabRef', { url: '/habitat.json' }) } }, inline,
    ]);
    const paths = [];
    const load = { getPrefab: path => { paths.push(path); return path === '/demo/habitat.json' ? habitat : null; } };
    const plan = await createSpatialPrefabPlan(source, load, { cellSize: 16 }, '/demo');
    assert.ok(paths.length && paths.every(p => p === '/demo/habitat.json'));
    assert.ok(plan.chunks.some(c => c.bounds.containsPoint(new Vector3(102, 0, 0))));
    assert.ok(plan.chunks.some(c => c.bounds.containsPoint(new Vector3(-98, 0, 0))));
    assert.ok(plan.chunks.some(c => c.bounds.containsPoint(new Vector3(4, 0, 0))));
    assert.ok(plan.chunks.every(c => !components(c.document).some(p => p.type === 'PrefabRef')));
    assert.deepEqual([...plan.materials], [['concrete', { color: '#888888' }]]);
    const again = await createSpatialPrefabPlan(source, load, { cellSize: 16 }, '/demo');
    assert.deepEqual(again.chunks.map(c => c.id), plan.chunks.map(c => c.id));
});

test('cell meshes share ancestor paths while preserving exact nested affine transforms', async () => {
    const { Euler, Quaternion } = await import('three');
    const children = Array.from({ length: 100 }, (_, i) => box(`bay-${i}`, [i / 10, 0, 0]));
    children[0].components.transform.properties.rotation = [0.3, 0.5, 0.1];
    const source = state([{ id: 'assembly', name: 'assembly', components: {
        transform: component('Transform', { position: [3, 4, 5], rotation: [0, 0, 0.6], scale: [2, 1, 3] }),
    }, children }]);
    const plan = await createSpatialPrefabPlan(source, runtime, { cellSize: 1000, maxNodesPerChunk: 96 });
    const matrices = document => {
        const result = new Map();
        const visit = (id, parent) => {
            const node = document.nodesById[id];
            const p = Object.values(node.components ?? {}).find(c => c?.type === 'Transform')?.properties ?? {};
            const local = new Matrix4().compose(new Vector3(...(p.position ?? [0, 0, 0])),
                new Quaternion().setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0]))), new Vector3(...(p.scale ?? [1, 1, 1])));
            const world = parent.clone().multiply(local);
            if (Object.values(node.components ?? {}).some(c => c?.type === 'Geometry')) result.set(node.name, world.elements);
            (document.childIdsById[id] ?? []).forEach(child => visit(child, world));
        };
        visit(document.rootId, new Matrix4()); return result;
    };
    const original = matrices(source), actual = new Map(plan.chunks.flatMap(c => [...matrices(c.document)]));
    assert.deepEqual(actual, original, 'nonuniform scale plus rotation must retain shear, without flattening/decomposition');
    assert.equal(actual.size, 100);
    const nodes = plan.chunks.flatMap(c => Object.values(c.document.nodesById));
    assert.ok(nodes.length < 125, 'a hundred siblings must not create a hundred copies of their parent chain');
    assert.ok(plan.chunks.every(c => Object.keys(c.document.nodesById).length <= 96));
    assert.ok(plan.chunks.every(c => components(c.document).filter(p => p.type === 'Geometry').length <= 48), 'sharing groups must not turn admission into a large mesh burst');
});

test('lights remain resident; unknown behavior preserves its whole document and cross-node references', async () => {
    const fixture = box('fixture', [1000, 0, 0]);
    fixture.children = [{ id: 'lamp', components: { light: component('PointLight', { intensity: 4 }) },
        children: [box('light-child', [0, 1, 0])] }];
    fixture.children.push({ id: 'second-lamp', components: { light: component('SpotLight') } });
    const source = state([fixture]);
    const plan = await createSpatialPrefabPlan(source, runtime);
    assert.equal(plan.chunks.length, 1);
    assert.equal(plan.residentStatic, true);
    const follow = state([{ id: 'sun', components: { light: component('DirectionalLight', { followCamera: true }) } }]);
    assert.equal((await createSpatialPrefabPlan(follow, runtime)).residentStatic, false);
    const [residentFixture] = Object.values(plan.resident.nodesById).filter(node => node.name === 'fixture');
    assert.ok(residentFixture);
    assert.deepEqual(plan.resident.childIdsById[residentFixture.id].map(id =>
        plan.resident.nodesById[id].components.light.type), ['PointLight', 'SpotLight']);
    assert.equal(Object.values(plan.resident.nodesById).filter(node => node.name === 'fixture').length, 1);
    assert.deepEqual(Object.values(plan.resident.nodesById).filter(n => n.components?.geometry).map(n => n.name), ['light-child']);
    assert.deepEqual(Object.values(plan.chunks[0].document.nodesById).filter(n => n.components?.geometry).map(n => n.name), ['fixture']);
    const scripted = state([{ id: 'script', components: { behavior: component('Follow', { target: 'visual' }) } }, box('visual', [1000, 0, 0])]);
    const pinned = await createSpatialPrefabPlan(scripted, runtime);
    assert.equal(pinned.resident, scripted);
    assert.equal(pinned.residentStatic, false);
    const { getComponent } = await import('../../src/core/ComponentRegistry.ts');
    const override = { ...getComponent('Data'), View: () => null };
    const custom = state([{ id: 'behavior', components: { data: component('Data') } }, box('mesh', [0, 0, 0])]);
    assert.equal((await createSpatialPrefabPlan(custom, {
        ...runtime, lookup: name => name === 'Data' ? override : getComponent(name),
    })).resident, custom);
    assert.equal(pinned.chunks.length, 0);
});

test('static imported models use asset bounds; animated or repeated models preserve their lifecycle', async () => {
    const { Mesh, BoxGeometry, MeshBasicMaterial, AnimationClip } = await import('three');
    const model = new Mesh(new BoxGeometry(10, 4, 6), new MeshBasicMaterial());
    const source = state([{ id: 'model', components: {
        transform: component('Transform', { position: [20, 0, 0], scale: [2, 1, 1] }),
        model: component('Model', { filename: '/crate.glb' }),
    } }]);
    const assets = { ...runtime, getModel: path => path === '/assets/crate.glb' ? model : null };
    const plan = await createSpatialPrefabPlan(source, assets, {}, '/assets');
    assert.equal(plan.chunks.length, 1);
    assert.deepEqual(plan.chunks[0].bounds.min.toArray(), [10, -2, -3]);
    assert.deepEqual(plan.chunks[0].bounds.max.toArray(), [30, 2, 3]);
    model.animations.push(new AnimationClip('idle', 1));
    assert.equal((await createSpatialPrefabPlan(source, assets, {}, '/assets')).resident, source);
    model.geometry.dispose(); model.material.dispose();
});

test('hidden subtrees, cancellation and invalid reference graphs cannot activate streamed geometry', async () => {
    const hidden = { ...box('hidden', [0, 0, 0]), hidden: true, children: [box('hidden-child', [0, 0, 0])] };
    const disabledMesh = box('invisible-mesh', [0, 0, 0]);
    disabledMesh.components.geometry.properties.visible = false;
    disabledMesh.children = [box('also-invisible', [0, 0, 0])];
    assert.equal((await createSpatialPrefabPlan(state([hidden, disabledMesh]), runtime)).chunks.length, 0);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(createSpatialPrefabPlan(state([box('a', [0, 0, 0])]), runtime, {}, '', controller.signal), { name: 'AbortError' });
    const cyclic = state([{ id: 'ref', components: { ref: component('PrefabRef', { url: '/cycle.json' }) } }]);
    await assert.rejects(createSpatialPrefabPlan(cyclic, { getPrefab: () => cyclic }), /Cyclic/);
});

test('evicting a placement between planning slices stops visiting its prefab references', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot } = await import('@react-three/fiber');
    const { AssetRuntimeContext } = await import('../../src/runtime/assets/AssetRuntime.tsx');
    const { SpatialPrefabInstance } = await import('../../src/runtime/prefabs/SpatialPrefabInstance.tsx');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });

    const document = state(Array.from({ length: 128 }, (_, i) => ({
        id: String(i), components: { ref: component('PrefabRef', { url: 'prop.json' }) },
    })));
    const prop = state([]);
    let reads = 0, now = 0;
    const assets = { getPrefab() { reads++; return prop; } };
    // Hold the next frame so eviction happens at a deterministic planning checkpoint.
    t.mock.method(performance, 'now', () => now += 4);
    const frames = [];
    const previous = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = callback => frames.push(callback);
    t.after(() => {
        if (previous) globalThis.requestAnimationFrame = previous;
        else delete globalThis.requestAnimationFrame;
    });
    await act(async () => { root.render(h(AssetRuntimeContext.Provider, { value: assets },
        h(SpatialPrefabInstance, { id: 'outgoing', document, options: {} }))); });
    const atEviction = reads;
    assert.ok(atEviction > 0 && atEviction < 128 && frames.length > 0);
    await act(async () => { root.render(null); });
    for (const resume of frames.splice(0)) resume(now);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(reads, atEviction);
});

test('preparation ranks bounds across tiles and octants, preserving in-flight work and residency', () => {
    const queue = new SpatialStreamScheduler(), events = [];
    const cell = (id, ...positions) => {
        const rendererBounds = positions.map(z => new Box3(new Vector3(-1, -1, z - 1), new Vector3(1, 1, z + 1)));
        const bounds = rendererBounds.reduce((union, box) => union.union(box), new Box3());
        return { phase: 'cold', bounds, cellKey: looseOctreeKey(bounds, bounds.getCenter(new Vector3()), 16),
            rendererBounds, mount: () => events.push(id) };
    };
    const add = (entries, matrix = new Matrix4()) => queue.register({ entries, tree: buildChunkTree(entries), matrix: () => matrix });
    const far = Array.from({ length: 20 }, (_, i) => cell('far', -100 - i));
    const behind = cell('behind', 5), road = cell('road', 100);
    add([cell('empty gap', -200, 200)]); add(far); add([behind]); add([road], new Matrix4().makeTranslation(0, 0, -105));
    const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
    queue.update(camera);
    assert.deepEqual(events, ['road']);
    queue.update(camera); queue.update(camera);
    assert.deepEqual(events, ['road', 'behind']);
    behind.phase = 'settled';
    camera.position.z = -115; queue.update(camera);
    assert.deepEqual(events, ['road', 'behind', 'far']);
    assert.equal(road.phase, 'preparing');
});

test('sibling placements share one frame admission and transfer it when the first unmounts', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot } = await import('@react-three/fiber');
    const { useStreamPlacement } = await import('../../src/runtime/prefabs/useStreamPlacement.ts');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {} },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    const admitted = [];
    function placement(...positions) {
        const entries = positions.map(z => {
            const bounds = new Box3().setFromCenterAndSize(new Vector3(0, 0, z), new Vector3(1, 1, 1));
            return { phase: 'cold', bounds, cellKey: looseOctreeKey(bounds, bounds.getCenter(new Vector3()), 16),
                rendererBounds: [bounds], mount() { admitted.push(z); this.phase = 'settled'; } };
        });
        return { entries, tree: buildChunkTree(entries), matrix: () => new Matrix4() };
    }
    function Placement({ value }) { useStreamPlacement(value); return null; }
    const far = h(Placement, { key: 'far', value: placement(-100) });
    const near = h(Placement, { key: 'near', value: placement(-2, -4) });
    let store;
    await act(async () => { store = root.render([far, near]); });
    assert.equal(store.getState().internal.subscribers.length, 1);
    await act(async () => store.getState().advance(1, false));
    assert.deepEqual(admitted, [-2]);
    await act(async () => root.render([near]));
    await act(async () => store.getState().advance(2, false));
    assert.deepEqual(admitted, [-2, -4]);
    assert.equal(store.getState().internal.subscribers.length, 0, 'the last admission stops the frame subscription');
    await act(async () => root.render([near, far]));
    assert.equal(store.getState().internal.subscribers.length, 1);
    await act(async () => store.getState().advance(3, false));
    assert.deepEqual(admitted, [-2, -4, -100]);
    await act(async () => root.render(null));
    assert.equal(store.getState().internal.subscribers.length, 0);
});

test('camera passes independently select chunks and distant emitters retain their visual children', async () => {
    const { Group, SpotLight } = await import('three');
    const root = new Group(), near = new Group(), behind = new Group(), lamp = new SpotLight(), lens = new Group();
    lamp.distance = 10; lamp.add(lens); lamp.position.z = -100;
    root.add(near, behind); root.updateMatrixWorld(); lamp.updateMatrixWorld();
    const cells = [near, behind].map((group, i) => ({ group, cellKey: i ? '0/0,0,0' : '0/0,0,-1', bounds: new Box3().setFromCenterAndSize(new Vector3(0, 0, i ? 10 : -10), new Vector3(1, 1, 1)) }));
    const visits = [];
    const renderer = { drawingPipeline: { project(object, camera) {
        visits.push(object);
        for (const child of object.children) this.project(child, camera);
    } } };
    const nativeProject = renderer.drawingPipeline.project;
    const release = registerChunkDraws(renderer, root, new Map(cells.entries()), buildChunkTree(cells));
    const camera = new PerspectiveCamera(60, 1, 0.1, 500);
    renderer.drawingPipeline.project(root, camera);
    assert.deepEqual(visits, [near]); visits.length = 0;
    camera.rotation.y = Math.PI; camera.updateMatrixWorld();
    renderer.drawingPipeline.project(root, camera);
    assert.deepEqual(visits, [behind]); visits.length = 0;
    renderer.drawingPipeline.project(lamp, camera);
    assert.deepEqual(visits, [lamp, lens]);
    // Compare placement-local results against independent Three tests for transformed placements.
    const { Frustum } = await import('three');
    root.position.set(3, 1, -5); root.rotation.y = 0.7; root.scale.set(2, 1, 0.5);
    root.updateMatrixWorld();
    for (let z = -40; z <= 40; z++) {
        camera.position.set(4, 0, z);
        camera.lookAt(root.position); camera.updateMatrixWorld();
        const clip = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(root.matrixWorld);
        const reference = new Frustum().setFromProjectionMatrix(clip);
        visits.length = 0;
        renderer.drawingPipeline.project(root, camera);
        assert.deepEqual(new Set(visits), new Set(cells.filter(cell => reference.intersectsBox(cell.bounds)).map(cell => cell.group)));
    }
    release();
    assert.equal(renderer.drawingPipeline.project, nativeProject);
});

test('shader preparation yields between bounded draw groups and serializes/cancels renderer work', async t => {
    const { Group, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { compileInSlices } = await import('../../src/runtime/rendering/compileInSlices.ts');
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    const root = new Group(); root.visible = false;
    for (let i = 0; i < 7; i++) root.add(new Mesh(geometry, material));
    const sizes = [];
    let now = 0, yields = 0, busy = 0, maxBusy = 0;
    t.mock.method(performance, 'now', () => now);
    const renderer = { compileAsync: async group => {
        busy++; maxBusy = Math.max(maxBusy, busy); sizes.push(group.children.length);
        assert.ok(group.children.every(child => child.parent === root), 'preparation must not reparent live objects');
        await Promise.resolve(); now += 4; busy--;
    } };
    const controller = new AbortController();
    const scene = new Scene(), camera = new PerspectiveCamera();
    const first = compileInSlices(renderer, root, camera, scene, { yieldFrame: async () => { yields++; } });
    const cancelled = compileInSlices(renderer, root, camera, scene, { signal: controller.signal, yieldFrame: async () => {} });
    controller.abort();
    await first; await assert.rejects(cancelled, { name: 'AbortError' });
    assert.deepEqual(sizes, [2, 2, 2, 1]);
    assert.equal(yields, 4); assert.equal(maxBusy, 1);
    assert.equal(root.visible, false);
    assert.ok(root.children.every(child => child.frustumCulled), 'temporary preparation flags must be restored');
    geometry.dispose(); material.dispose();
});

test('warm shader batches reuse a measured slice budget without turning into an unbounded burst', async t => {
    const { Group, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { compileInSlices } = await import('../../src/runtime/rendering/compileInSlices.ts');
    let now = 0, yields = 0, batches = 0;
    t.mock.method(performance, 'now', () => now);
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), root = new Group();
    for (let i = 0; i < 24; i++) root.add(new Mesh(geometry, material));
    const renderer = { compileAsync: async group => { assert.ok(group.children.length <= 2); batches++; now += 1; } };
    await compileInSlices(renderer, root, new PerspectiveCamera(), new Scene(), {
        yieldFrame: async () => { yields++; now += 16; },
    });
    assert.equal(yields, 4, 'twelve cheap batches fit into four bounded slices, instead of twelve frames');
    assert.equal(batches, 12);
    yields = batches = 0;
    await compileInSlices(renderer, root, new PerspectiveCamera(), new Scene(), {
        yieldBeforeFirstSlice: false,
        yieldFrame: async () => { yields++; now += 16; },
    });
    assert.equal(yields, 3, 'a cell can start its first slice without an extra frame');
    assert.equal(batches, 12);
    geometry.dispose(); material.dispose();
});

test('compilation pass state survives frame yields and restores on failure or replacement', async () => {
    const { Group, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { compileInSlices, registerPrefabCompilationContext } = await import('../../src/runtime/rendering/compileInSlices.ts');
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), root = new Group(); root.add(new Mesh(geometry, material));
    let target = 'screen', active = 'screen';
    const renderer = { compileAsync: async () => { assert.equal(target, 'scene'); assert.equal(active, 'mrt'); throw Error('driver'); } };
    const old = registerPrefabCompilationContext(renderer, () => { throw Error('obsolete context'); });
    const remove = registerPrefabCompilationContext(renderer, () => {
        const savedTarget = target, savedActive = active;
        target = 'scene'; active = 'mrt';
        return () => { target = savedTarget; active = savedActive; };
    });
    old();
    await assert.rejects(compileInSlices(renderer, root, new PerspectiveCamera(), new Scene(), {
        yieldFrame: async () => {
            assert.equal(target, 'scene');
            // A normal screen render temporarily switches targets and restores
            // the paused compilation's standing state before it resumes.
            const saved = target; target = 'screen'; target = saved;
        },
    }), /driver/);
    assert.equal(target, 'screen'); assert.equal(active, 'screen');
    remove(); geometry.dispose(); material.dispose();
});

for (const mode of ['url', 'embedded']) test(`PrefabInstance streams ${mode} and keeps prepared cells on camera moves`, async t => {
    const embedded = mode !== 'url';
    const { act, createElement: h, StrictMode, useEffect } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group, Mesh, Texture } = await import('three');
    const { PrefabInstance } = await import('../../src/runtime/prefabs/PrefabInstance.tsx');
    const { preparePrefab } = await import('../../src/runtime/prefabs/preparePrefab.ts');
    const { AssetCacheContext, createAssetCache } = await import('../../src/runtime/assets/assetCache.ts');
    const { SceneRuntime } = await import('../../src/runtime/SceneRuntime.tsx');
    const { getComponent } = await import('../../src/core/ComponentRegistry.ts');
    const { AssetRuntimeContext } = await import('../../src/runtime/assets/AssetRuntime.tsx');
    const { usePrefab } = await import('../../src/runtime/scene/SceneContext.tsx');
    const { ChunkSettingsContext } = await import('../../src/runtime/components/ChunkSettingsComponent.tsx');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    extend({ Group, Mesh });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    let compiles = 0;
    await root.configure({ gl: { render() {}, compileAsync: async () => { compiles++; }, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    const document = state([box('near-mesh', [0, 0, 0], { name: 'paint' }), box('near-peer', [25, 0, 0], { name: 'paint' }),
        box('paint-definition', [1000, 0, 0], { name: 'paint', color: '#abc123' }),
        box('far-mesh', [1000.00001, 0, 0], { texture: '/far.png' }), box('missing', [5, 0, 0], { name: 'missing' })]);
    document.nodesById[document.rootId].components = { chunks: component('ChunkSettings', { cellSize: 64, maxNodesPerChunk: 16 }) };
    const sources = [], textureRequests = [];
    const texture = new Texture();
    let finishTexture;
    const pendingTexture = new Promise(resolve => { finishTexture = resolve; });
    const cache = createAssetCache({ texture: path => { textureRequests.push(path); return pendingTexture; } });
    t.after(() => { cache.dispose(); texture.dispose(); });
    const assets = {
        preparePrefab(source, options) {
            sources.push(source);
            return preparePrefab({
                getComponent,
                loadDocument: async () => document,
                loadTexture: path => cache.load('texture', path),
            }, source, options);
        },
        getPrefab: () => null,
    };
    const statuses = [], timings = [];
    let residentMounts = 0;
    function ResidentChild() {
        const prefab = usePrefab();
        useEffect(() => { assert.ok(prefab); residentMounts++; }, [prefab]);
        return null;
    }
    const view = settings => h(StrictMode, null, h(AssetCacheContext.Provider, { value: cache }, h(SceneRuntime, null, h(ChunkSettingsContext.Provider, { value: settings },
        h(AssetRuntimeContext.Provider, { value: assets }, h(PrefabInstance, {
            id: 'runtime', source: embedded ? document : '/same-prefab.json', static: true,
            onStatus: s => statuses.push(s.phase), onChunkTiming: timing => timings.push(timing),
        }, h(ResidentChild)))))));
    let scene;
    await act(async () => { scene = root.render(view(null)); });
    let frame = 0;
    const advance = async () => {
        await act(async () => { scene.getState().advance(++frame / 60, false); await new Promise(resolve => setTimeout(resolve, 4)); });
    };
    // Admit the textured cell first, then move away while its request is stalled.
    scene.getState().camera.position.x = 1000;
    for (let i = 0; i < 12 && !textureRequests.length; i++) await advance();
    assert.deepEqual(textureRequests, ['/far.png']);
    scene.getState().camera.position.x = 0;
    for (let i = 0; i < 12; i++) await advance();
    const batch = () => {
        let result;
        scene.getState().scene.traverse(object => { if (object.isInstancedMesh && object.count === 2) result = object; });
        return result;
    };
    const near = () => scene.getState().scene.getObjectByName('near-mesh');
    assert.equal(near(), undefined);
    const materialOf = name => scene.getState().scene.getObjectByName(name).children.find(child => child.isMesh).material;
    assert.ok(batch(), 'nearby untextured geometry mounts while the first request is stalled');
    for (let object = batch(); object; object = object.parent) assert.ok(object.visible, 'the nearby batch is draw-visible');
    assert.equal(batch().material.color.getHexString(), 'abc123');
    assert.equal(materialOf('missing').visible, false);
    assert.ok(batch(), 'one bounded stream chunk batches peers across the global 24-unit grid boundary');
    assert.deepEqual([batch().instanceMatrix.array[12], batch().instanceMatrix.array[28]], [0, 25]);
    assert.equal(scene.getState().scene.getObjectByName('near-peer'), undefined, 'direct batches have no source mesh');
    assert.ok(statuses.includes('active')); assert.ok(compiles > 0);
    const residentBatch = batch(), preparations = sources.length;
    await act(async () => { root.render(view({ cellSize: 64, maxNodesPerChunk: 16 })); });
    assert.equal(sources.length, preparations, 'inheriting equivalent chunk settings preserves preparation');
    assert.equal(batch(), residentBatch, 'the existing GPU batch survives the settings edit');
    const mounts = residentMounts;
    assert.ok(mounts > 0, 'host children inherit the resident prefab context');
    scene.getState().camera.position.x = 1000;
    for (let i = 0; i < 4; i++) await advance();
    assert.deepEqual(textureRequests, ['/far.png']);
    assert.ok(!scene.getState().scene.getObjectByName('far-mesh'), 'a cell waits for its textures before committing');
    finishTexture(texture);
    for (let i = 0; i < 12; i++) await advance();
    assert.ok(!scene.getState().scene.getObjectByName('near-mesh'));
    assert.ok(batch());
    const single = scene.getState().scene.getObjectByName('far-mesh');
    assert.ok(single.isMesh && !single.isInstancedMesh);
    assert.equal(single.getWorldPosition(new Vector3()).x, 1000.00001);
    assert.equal(single.material.map.source, texture.source);
    scene.getState().camera.position.x = 0;
    for (let i = 0; i < 12; i++) await advance();
    assert.equal(near(), undefined);
    assert.equal(batch().material.color.getHexString(), 'abc123');
    const readyIds = timings.map(sample => sample.id);
    assert.ok(readyIds.length > 0);
    assert.equal(new Set(readyIds).size, readyIds.length, 'returning to a cell preserves its residency');
    assert.ok(timings.every(t => t.admittedAt <= t.compilingAt && t.compilingAt <= t.readyAt));
    assert.ok(!statuses.includes('error'));
    assert.equal(residentMounts, mounts, 'cell residency cannot remount host children');
    assert.ok(sources.every(source => source === (embedded ? document : '/same-prefab.json')));
});

test('authored presentation remains resident without pinning ordinary scenery beneath the scene root', async () => {
    const source = normalizePrefab({ root: { id: 'world', components: {
        settings: component('RenderSettings', { exposure: 1.2 }),
        probe: component('DiffuseLightProbe', { intensity: 0.3 }),
        fog: component('Fog', { far: 200 }),
        ambient: component('AmbientLight', { intensity: 0.2 }),
        hemisphere: component('HemisphereLight'),
        transform: component('Transform', { position: [10, 0, 0] }),
    }, children: [
        box('scenery', [100, 0, 0]),
        { id: 'environment', components: { environment: component('Environment') }, children: [
            { id: 'sky', components: { sky: component('Sky') }, children: [box('capture-only', [0, 0, 0])] },
        ] },
    ] } });
    const before = JSON.stringify(source);
    const plan = await createSpatialPrefabPlan(source, runtime);
    assert.equal(plan.chunks.length, 1, 'presentation components must not disable scenery streaming');
    assert.ok(plan.chunks[0].bounds.containsPoint(new Vector3(110, 0, 0)));
    const resident = components(plan.resident);
    for (const type of ['RenderSettings', 'DiffuseLightProbe', 'Fog', 'AmbientLight', 'HemisphereLight', 'Environment', 'Sky']) {
        assert.equal(resident.filter(c => c.type === type).length, 1, `${type} must stay resident exactly once`);
        assert.ok(!plan.chunks.some(chunk => components(chunk.document).some(c => c.type === type)));
    }
    assert.equal(resident.filter(c => c.type === 'Geometry').length, 1, 'environment capture children stay in the capture subtree');
    assert.ok(!Object.values(plan.resident.nodesById).some(node => node.name === 'scenery'));
    assert.equal(JSON.stringify(source), before);
});

test('render-pass resources survive replacement until admitted shader preparation finishes or fails', async () => {
    const { Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Scene } = await import('three');
    const { compileInSlices, disposeAfterPrefabCompilation, registerPrefabCompilationContext } = await import('../../src/runtime/rendering/compileInSlices.ts');
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial(), root = new Group();
    root.add(new Mesh(geometry, material));
    try {
        for (const fail of [false, true]) {
            let release, started, disposed = false, targetSelected = false;
            const begun = new Promise(resolve => { started = resolve; });
            const renderer = { compileAsync: () => new Promise((resolve, reject) => {
                assert.equal(targetSelected, true); started();
                release = () => fail ? reject(Error('compilation failed')) : resolve();
            }) };
            const unregister = registerPrefabCompilationContext(renderer, () => {
                targetSelected = true; return () => { targetSelected = false; };
            });
            const work = compileInSlices(renderer, root, new PerspectiveCamera(), new Scene(), { yieldFrame: async () => {} });
            await begun;
            unregister();
            disposeAfterPrefabCompilation(renderer, () => { assert.equal(targetSelected, false); disposed = true; });
            assert.equal(disposed, false, 'a replaced target must remain alive while compilation is pending');
            release();
            if (fail) await assert.rejects(work, /compilation failed/);
            else await work;
            await Promise.resolve();
            assert.equal(disposed, true);
        }
    } finally { geometry.dispose(); material.dispose(); }
});

test('frozen placement descendants refresh when an ancestor moves and sleep when it holds still', async t => {
    const { Group } = await import('three');
    const { PlacementGroup } = await import('../../src/runtime/prefabs/PlacementGroup.ts');
    const parent = new Group(), placement = new PlacementGroup(), mesh = new Group();
    parent.add(placement); placement.add(mesh);
    mesh.position.x = 2;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = placement.matrixAutoUpdate = false;
    parent.updateMatrixWorld();
    const multiply = t.mock.method(mesh.matrixWorld, 'multiplyMatrices');
    for (let i = 0; i < 60; i++) parent.updateMatrixWorld();
    assert.equal(multiply.mock.callCount(), 0);
    parent.position.x = 10;
    parent.scale.x = 3;
    parent.updateMatrixWorld();
    assert.equal(mesh.matrixWorld.elements[12], 16);
    assert.equal(multiply.mock.callCount(), 1);
});

test('compiled cells skip static descendants and refresh moved placements, edits and late attachments', async t => {
    const { Group } = await import('three');
    const { PlacementGroup } = await import('../../src/runtime/prefabs/PlacementGroup.ts');
    const { notifyObjectChanged } = await import('../../src/runtime/scene/objectChanges.ts');
    const world = new Group(), placement = new PlacementGroup(), cell = new PlacementGroup();
    const branch = new Group(), leaf = new Group(), actor = new Group();
    const camera = new PerspectiveCamera();
    world.add(placement, camera);
    placement.matrixAutoUpdate = false;
    placement.add(cell, actor);
    cell.add(branch); branch.add(leaf);
    leaf.position.x = 2;
    const edit = cell.sleep();
    world.updateMatrixWorld();
    const visits = t.mock.method(leaf, 'updateMatrixWorld');
    const updates = t.mock.method(leaf.matrixWorld, 'multiplyMatrices');
    for (let i = 0; i < 60; i++) {
        camera.rotation.y += 0.01;
        actor.position.x++;
        world.updateMatrixWorld();
    }
    assert.equal(actor.matrixWorld.elements[12], 60);
    assert.equal(visits.mock.callCount(), 0);
    assert.equal(updates.mock.callCount(), 0);
    world.position.set(10, 3, 0);
    world.rotation.z = Math.PI / 2;
    world.scale.x = 2;
    world.updateMatrixWorld();
    assert.ok(new Vector3().setFromMatrixPosition(leaf.matrixWorld).distanceTo(new Vector3(10, 7, 0)) < 1e-9);
    assert.equal(visits.mock.callCount(), 1);
    branch.position.x = 1;
    notifyObjectChanged(branch);
    world.updateMatrixWorld();
    assert.equal(leaf.matrixWorld.elements[13], 9);
    const late = new Group();
    branch.add(late);
    world.updateMatrixWorld();
    const batch = new Group();
    batch.position.x = 4;
    late.add(batch);
    world.updateMatrixWorld();
    assert.equal(batch.matrixWorld.elements[13], 13, 'a nested late batch receives its world matrix');
    late.removeFromParent();
    const previous = visits.mock.callCount();
    late.add(new Group());
    world.updateMatrixWorld();
    assert.equal(visits.mock.callCount(), previous, 'detached objects no longer wake the cell');
    edit();
    leaf.position.x = 5;
    world.updateMatrixWorld();
    assert.equal(leaf.matrixWorld.elements[13], 15, 'edit mode sees direct gizmo writes without notifications');
    const resumeEdit = cell.sleep();
    world.updateMatrixWorld();
    const afterEdit = visits.mock.callCount();
    world.updateMatrixWorld();
    assert.equal(visits.mock.callCount(), afterEdit, 'returning to play sleeps the cell again');
    resumeEdit();
});

test('large draw placements prune empty branches and admit new cells at a stationary camera', async () => {
    const { Group } = await import('three');
    const cells = Array.from({ length: 256 }, (_, i) => ({
        bounds: new Box3().setFromCenterAndSize(new Vector3(i * 8, 0, -10), new Vector3(1, 1, 1)),
        cellKey: '0/' + i + ',0,-2', group: new Group(),
    }));
    const placement = new Group(), ready = new Map(cells.entries());
    const drawn = [];
    const renderer = { drawingPipeline: { project: object => drawn.push(object) } };
    ready.delete(0);
    const release = registerChunkDraws(renderer, placement, ready, buildChunkTree(cells));
    const camera = new PerspectiveCamera(40, 1, 0.1, 50);
    renderer.drawingPipeline.project(placement, camera);
    assert.deepEqual(drawn, []);
    ready.set(0, cells[0]);
    renderer.drawingPipeline.project(placement, camera);
    assert.deepEqual(drawn, [cells[0].group]);
    drawn.length = 0;
    camera.position.x = 1200; camera.updateMatrixWorld();
    renderer.drawingPipeline.project(placement, camera);
    assert.deepEqual(drawn, [cells[150].group]);
    release();
});

test('a static prefab sleeps as a unit, editor moves and streamed gameplay stay live', async t => {
    const { createElement: h, act } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group, Mesh } = await import('three');
    const { PrefabInstance } = await import('../../src/runtime/prefabs/PrefabInstance.tsx');
    const { SceneContext, PrefabEditorMode } = await import('../../src/runtime/scene/SceneContext.tsx');
    const { AssetRuntimeContext } = await import('../../src/runtime/assets/AssetRuntime.tsx');
    const { ChunkSettingsContext } = await import('../../src/runtime/components/ChunkSettingsComponent.tsx');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    extend({ Group, Mesh });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, async compileAsync() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(() => act(async () => root.unmount()));

    const shelf = state([{ id: 'mug', name: 'mug', components: {
        pose: component('Transform', { position: [1, 0, 0] }), shape: component('Geometry'),
    } }]);
    const actor = state([{ id: 'actor', name: 'Actor', components: {
        motion: component('Runtime', { update: 'object.position.y += 1;' }),
    } }]);
    const assets = { preparePrefab: async document => document };
    const active = new Set();
    const place = (id, document) => h(PrefabInstance, { id, source: document, static: true, onStatus(status) {
        if (status.phase === 'active') active.add(id);
    } });
    let store;
    const render = mode => act(async () => {
        store = root.render(h(SceneContext.Provider, { value: { mode, editable: true } },
            h(AssetRuntimeContext.Provider, { value: assets },
                h('group', { name: 'placement' }, place('shelf', shelf)),
                h(ChunkSettingsContext.Provider, { value: { cellSize: 64, maxNodesPerChunk: 16 } }, place('gameplay', actor)))));
    });
    await render(PrefabEditorMode.Play);
    const scene = store.getState().scene;
    let frame = 0;
    const advance = () => act(async () => {
        store.getState().advance(++frame / 60, false);
        await new Promise(resolve => setTimeout(resolve, 4));
    });
    for (let i = 0; i < 30 && active.size < 2; i++) await advance();
    assert.deepEqual([...active].sort(), ['gameplay', 'shelf']);
    const mug = scene.getObjectByName('mug'), actorObject = scene.getObjectByName('Actor');
    scene.updateMatrixWorld();
    const visits = t.mock.method(mug, 'updateMatrixWorld');
    const y = actorObject.position.y;
    await advance();
    scene.updateMatrixWorld();
    assert.equal(actorObject.matrixWorld.elements[13], y + 1);
    assert.equal(visits.mock.callCount(), 0);
    scene.getObjectByName('placement').position.x = 10;
    scene.updateMatrixWorld();
    assert.equal(mug.matrixWorld.elements[12], 11);
    scene.updateMatrixWorld();
    assert.equal(visits.mock.callCount(), 1);

    await render(PrefabEditorMode.Edit);
    mug.position.x = 3;
    scene.updateMatrixWorld();
    assert.equal(mug.matrixWorld.elements[12], 13);
    await render(PrefabEditorMode.Play);
    scene.updateMatrixWorld();
    const afterEdit = visits.mock.callCount();
    scene.updateMatrixWorld();
    assert.equal(visits.mock.callCount(), afterEdit);
});
