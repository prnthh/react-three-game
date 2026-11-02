import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Matrix4, Vector3 } from 'three';
import { registerBuiltInComponents } from '../../src/runtime/components/index.ts';
registerBuiltInComponents();
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createSpatialPrefabPlan } from '../../src/runtime/prefabs/spatialPrefabPlan.ts';
import { SpatialStreamScheduler } from '../../src/runtime/prefabs/SpatialStreamScheduler.ts';

const component = (type, properties = {}) => ({ type, properties });
const box = (id, position, material = {}) => ({ id, name: id, components: {
    transform: component('Transform', { position }), geometry: component('Geometry', { geometryType: 'box' }),
    material: component('Material', material),
} });
const state = children => normalizePrefab({ root: { id: 'world', children } });
const runtime = { getPrefab: () => null };
const components = document => Object.values(document.nodesById).flatMap(n => Object.values(n.components ?? {}));

test('spatial planning resolves distant material definitions, preserves transforms and bounds oversized geometry', async () => {
    const floor = box('long-floor', [500, 0, 0]);
    floor.components.transform.properties.scale = [1200, 1, 10];
    const source = state([box('definition', [1000, 0, 0], { name: 'shared', color: '#abc123' }),
        { id: 'rotated', components: { transform: component('Transform', { position: [10, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 3, 1] }) }, children: [box('near', [2, 0, 0], { name: 'shared' })] }, floor]);
    const before = JSON.stringify(source);
    const plan = await createSpatialPrefabPlan(source, runtime, { cellSize: 32, maxNodesPerChunk: 12 });
    assert.equal(JSON.stringify(source), before, 'planning cannot mutate the shared loaded definition');
    const near = plan.chunks.find(c => Object.values(c.document.nodesById).some(n => n.name === 'near'));
    assert.ok(near);
    assert.ok(components(near.document).some(c => c.type === 'Material' && c.properties.color === '#abc123' && !c.properties.name),
        'the defining cell can be absent without making references invisible');
    assert.ok(near.bounds.min.distanceTo(new Vector3(8.5, 3, -0.5)) < 1e-9);
    assert.ok(near.bounds.max.distanceTo(new Vector3(11.5, 5, 0.5)) < 1e-9);
    const long = plan.chunks.find(c => Object.values(c.document.nodesById).some(n => n.name === 'long-floor'));
    assert.equal(long.bounds.distanceToPoint(new Vector3()), 0, 'a distant center must not hide a mesh extending to the camera');
    assert.ok(plan.chunks.every(c => c.nodeCount <= 12));
    for (const chunk of plan.chunks) {
        const ids = Object.keys(chunk.document.nodesById);
        assert.equal(ids.length, new Set(ids).size);
    }
});

test('external and packed references expand with distinct placement transforms, material scopes and stable plans', async () => {
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
    assert.ok(plan.chunks.every(c => c.nodeCount <= 96));
    assert.ok(plan.chunks.every(c => components(c.document).filter(p => p.type === 'Geometry').length <= 48), 'sharing groups must not turn admission into a large mesh burst');
});

test('lights remain resident; unknown behavior preserves its whole document and cross-node references', async () => {
    const source = state([box('visual', [1000, 0, 0]), { id: 'lamp', components: { light: component('PointLight', { intensity: 4 }) } }]);
    const plan = await createSpatialPrefabPlan(source, runtime);
    assert.equal(plan.chunks.length, 1);
    assert.ok(components(plan.resident).some(c => c.type === 'PointLight'));
    assert.ok(!components(plan.resident).some(c => c.type === 'Geometry'));
    const scripted = state([{ id: 'script', components: { behavior: component('Follow', { target: 'visual' }) } }, box('visual', [1000, 0, 0])]);
    const pinned = await createSpatialPrefabPlan(scripted, runtime);
    assert.equal(pinned.resident, scripted);
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

function entry(id, bounds, events) {
    return { id, bounds, phase: 'cold', visible: false,
        mount: () => events.push(`mount:${id}`), unmount: () => events.push(`unmount:${id}`),
        setVisible: value => events.push(`visible:${id}:${value}`),
    };
}
const placement = (entries, options, matrix = new Matrix4()) => ({ entries, options, matrix: () => matrix });
const boundsAt = x => new Box3(new Vector3(x - 1, -1, -1), new Vector3(x + 1, 1, 1));

test('one global queue prepares nearest bounds first, hides warmed chunks, and applies unload hysteresis', () => {
    const queue = new SpatialStreamScheduler(), events = [];
    const options = { visibleDistance: 10, preloadDistance: 20, unloadDistance: 30 };
    const far = entry('far', boundsAt(15), events), near = entry('near', boundsAt(0), events);
    queue.register(placement([far], options)); queue.register(placement([near], options));
    queue.update(new Vector3());
    assert.deepEqual(events, ['mount:near']);
    queue.update(new Vector3());
    assert.equal(events.length, 1, 'another placement cannot mount during an in-flight preparation');
    near.phase = 'ready'; queue.update(new Vector3());
    assert.deepEqual(events.slice(1), ['visible:near:true', 'mount:far']);
    far.phase = 'ready'; queue.update(new Vector3());
    assert.equal(far.visible, false, 'prefetch is prepared without being drawn');
    queue.update(new Vector3(15, 0, 0));
    assert.equal(near.visible, false); assert.equal(near.phase, 'ready', 'hidden warm chunks stay mounted within the unload band');
    assert.equal(far.visible, true);
    queue.update(new Vector3(40, 0, 0));
    assert.equal(near.phase, 'cold'); assert.equal(far.phase, 'ready');
    assert.equal(events.filter(e => e.startsWith('unmount:')).length, 1, 'unmount work is bounded per frame too');
    queue.update(new Vector3());
    assert.equal(near.phase, 'preparing', 'returning to an evicted cell prepares it again');
});

test('world transforms, oversized bounds, failed loads and unregistering work across repeated placements', () => {
    const queue = new SpatialStreamScheduler(), events = [];
    const options = { visibleDistance: 5, preloadDistance: 8, unloadDistance: 12 };
    const transformed = entry('translated', boundsAt(100), events);
    const dispose = queue.register(placement([transformed], options, new Matrix4().makeTranslation(-100, 0, 0)));
    const second = entry('second', boundsAt(5), events); queue.register(placement([second], options));
    queue.update(new Vector3());
    assert.equal(transformed.phase, 'preparing');
    transformed.phase = 'error'; queue.update(new Vector3());
    assert.equal(second.phase, 'preparing', 'a failed cell cannot stall the shared queue');
    dispose(); second.phase = 'ready';
    queue.update(new Vector3(1000, 0, 0));
    assert.equal(second.phase, 'cold');
    assert.ok(!events.includes('unmount:translated'), 'unregistered placements cannot receive late work');
});

test('shader preparation yields between bounded draw groups and serializes/cancels renderer work', async () => {
    const { Group, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { compileInSlices } = await import('../../src/runtime/rendering/compileInSlices.ts');
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    const root = new Group(); root.visible = false;
    for (let i = 0; i < 7; i++) root.add(new Mesh(geometry, material));
    const sizes = [];
    let yields = 0, busy = 0, maxBusy = 0;
    const renderer = { compileAsync: async group => {
        busy++; maxBusy = Math.max(maxBusy, busy); sizes.push(group.children.length);
        assert.ok(group.children.every(child => child.parent === root), 'preparation must not reparent live objects');
        await Promise.resolve(); busy--;
    } };
    const controller = new AbortController();
    const scene = new Scene(), camera = new PerspectiveCamera();
    const first = compileInSlices(renderer, root, camera, scene, { batchSize: 2, timeBudgetMs: 0, yieldFrame: async () => { yields++; } });
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
        batchSize: 2, timeBudgetMs: 3, yieldFrame: async () => { yields++; now += 16; },
    });
    assert.equal(yields, 4, 'twelve cheap batches fit into four bounded slices, instead of twelve frames');
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

for (const embedded of [false, true]) test(`PrefabInstance streams ${embedded ? 'an embedded document' : 'a URL'} and can unload and revisit cells`, async t => {
    const { act, createElement: h, StrictMode, useEffect, useRef } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { PrefabInstance } = await import('../../src/runtime/prefabs/PrefabInstance.tsx');
    const { AssetRuntimeContext } = await import('../../src/runtime/assets/AssetRuntime.tsx');
    const { ComponentLookupContext } = await import('../../src/runtime/prefabs/nodePlan.ts');
    const { usePrefab, useGameObject } = await import('../../src/runtime/scene/SceneContext.tsx');
    const { useMeshInstanceRegistration } = await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    const { ChunkSettingsContext } = await import('../../src/runtime/components/ChunkSettingsComponent.tsx');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    extend({ Group, Mesh });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    geometry.userData.prefabGeometrySignature = 'streamed-shared-box';
    let compiles = 0;
    await root.configure({ gl: { render() {}, compileAsync: async () => { compiles++; }, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); geometry.dispose(); material.dispose(); });
    function GeometryView() {
        const mesh = useRef(null), { id } = useGameObject();
        useMeshInstanceRegistration(id, mesh, true);
        return h('mesh', { ref: mesh, geometry, material });
    }
    const definitions = {
        Geometry: { name: 'Geometry', properties: {}, renderWhenDisabled: true, View: GeometryView },
        Transform: { name: 'Transform', properties: {} }, Material: { name: 'Material', properties: {} },
    };
    const document = state([box('near-mesh', [0, 0, 0]), box('near-peer', [25, 0, 0]), box('far-mesh', [1000, 0, 0])]);
    document.nodesById[document.rootId].components = { chunks: component('ChunkSettings', { cellSize: 64, visibleDistance: 20, preloadDistance: 30, unloadDistance: 40, maxNodesPerChunk: 16 }) };
    definitions.ChunkSettings = { name: 'ChunkSettings', scope: 'scene', properties: {} };
    const sources = [];
    const assets = { preparePrefab: async source => { sources.push(source); return { document }; }, getPrefab: () => null };
    const statuses = [], chunks = [];
    let residentMounts = 0;
    function ResidentChild() {
        const prefab = usePrefab();
        useEffect(() => { assert.ok(prefab); residentMounts++; }, [prefab]);
        return null;
    }
    const view = settings => h(StrictMode, null, h(ChunkSettingsContext.Provider, { value: settings }, h(ComponentLookupContext.Provider, { value: name => definitions[name] },
        h(AssetRuntimeContext.Provider, { value: assets }, h(PrefabInstance, {
            id: 'runtime', ...(embedded ? { document } : { url: '/same-prefab.json' }), static: true,
            onStatus: s => statuses.push(s.phase), onChunkStatus: s => chunks.push(s),
        }, h(ResidentChild))))));
    let scene;
    await act(async () => { scene = root.render(view(null)); });
    let frame = 0;
    const advance = async () => {
        await act(async () => { scene.getState().advance(++frame / 60, false); await new Promise(resolve => setTimeout(resolve, 4)); });
    };
    for (let i = 0; i < 12; i++) await advance();
    assert.ok(scene.getState().scene.getObjectByName('near-mesh'));
    const batches = [];
    scene.getState().scene.traverse(object => { if (object.isInstancedMesh) batches.push(object); });
    assert.ok(batches.some(batch => batch.count === 2), 'one bounded stream chunk batches peers across the global 24-unit grid boundary');
    assert.ok(!scene.getState().scene.getObjectByName('far-mesh'), 'distant cells do not create their Three objects');
    assert.ok(statuses.includes('active')); assert.ok(compiles > 0);
    const mounts = residentMounts;
    assert.ok(mounts > 0, 'host children inherit the resident prefab context');
    const readyCount = chunks.filter(chunk => chunk.phase === 'ready').length;
    const compiledCount = compiles;
    await act(async () => { root.render(view({ ...document.nodesById[document.rootId].components.chunks.properties, batchCellSize: 24, visibleDistance: 24 })); });
    for (let i = 0; i < 3; i++) await advance();
    assert.equal(residentMounts, mounts, 'distance edits preserve the resident scene');
    assert.equal(chunks.filter(chunk => chunk.phase === 'ready').length, readyCount, 'distance edits preserve prepared chunks');
    assert.equal(compiles, compiledCount, 'distance edits do not restart shader preparation');
    scene.getState().camera.position.x = 1000;
    for (let i = 0; i < 12; i++) await advance();
    assert.ok(!scene.getState().scene.getObjectByName('near-mesh'));
    assert.ok(scene.getState().scene.getObjectByName('far-mesh'));
    scene.getState().camera.position.x = 0;
    for (let i = 0; i < 12; i++) await advance();
    assert.ok(scene.getState().scene.getObjectByName('near-mesh'));
    assert.ok(chunks.filter(s => s.phase === 'unloaded').length >= 2);
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
    for (const type of ['RenderSettings', 'DiffuseLightProbe', 'Fog', 'AmbientLight', 'Environment', 'Sky']) {
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
