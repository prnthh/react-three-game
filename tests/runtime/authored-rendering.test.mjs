import test from 'node:test';
import assert from 'node:assert/strict';
import { AgXToneMapping, NoToneMapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three';
import { applyRendererSettings } from '../../src/runtime/components/RenderSettingsComponent.tsx';
import { createDiffuseProbeSH } from '../../src/runtime/components/DiffuseLightProbeComponent.tsx';
import { getPrefabEditorView } from '../../src/editor/sceneView.ts';
import { evaluateSceneCommands } from '../../src/core/sceneCommands.ts';
import { getComponent, resolveComponentProperties } from '../../src/core/ComponentRegistry.ts';
import { registerBuiltInComponents } from '../../src/runtime/components/index.ts';
import SkyComponent from '../../src/runtime/components/SkyComponent.tsx';

registerBuiltInComponents();

test('authored render settings override only specified fields and restore their host values', () => {
    const renderer = { toneMapping: NoToneMapping, toneMappingExposure: 2, outputColorSpace: LinearSRGBColorSpace, shadowMap: { enabled: false, type: 1 } };
    const reset = applyRendererSettings(renderer, { toneMapping: 'agx', exposure: 1.05, outputColorSpace: 'srgb' });
    assert.equal(renderer.toneMapping, AgXToneMapping);
    assert.equal(renderer.toneMappingExposure, 1.05);
    assert.equal(renderer.outputColorSpace, SRGBColorSpace);
    reset.restore();
    assert.equal(renderer.toneMapping, NoToneMapping);
    assert.equal(renderer.toneMappingExposure, 2);
    assert.equal(renderer.outputColorSpace, LinearSRGBColorSpace);
    const resetExposure = applyRendererSettings(renderer, { exposure: 0.5 });
    renderer.outputColorSpace = SRGBColorSpace;
    resetExposure.restore();
    assert.equal(renderer.toneMappingExposure, 2);
    assert.equal(renderer.outputColorSpace, SRGBColorSpace, 'unspecified fields are not captured or restored');
});

test('sky, probe and render settings use ordinary discovery, command validation and JSON round trips', () => {
    const original = { root: { id: 'root' } };
    const commands = ['RenderSettings', 'Sky', 'DiffuseLightProbe', 'PostProcessing', 'ChunkSettings'].map((type, i) => ({ op: 'component', id: 'root', key: `c${i}`, component: { type, properties: {} } }));
    const edited = evaluateSceneCommands(original, { commands });
    assert.equal(JSON.parse(JSON.stringify(edited.prefab)).root.components.c0.type, 'RenderSettings');
    assert.ok(getComponent('Sky').properties.turbidity);
    assert.ok(getComponent('DiffuseLightProbe').properties.skyColor);
    assert.throws(() => evaluateSceneCommands(original, { commands: [{ ...commands[0], component: { type: 'RenderSettings', properties: { toneMapping: 'unknown' } } }] }), /toneMapping/);
    assert.throws(() => evaluateSceneCommands(original, { commands: [{ ...commands[1], component: { type: 'Sky', properties: { sunPosition: [1] } } }] }), /sunPosition/);
});

test('sampled diffuse probes preserve constant radiance and respond to authored direction', () => {
    const p = resolveComponentProperties(getComponent('DiffuseLightProbe'), { skyColor: '#ffffff', groundColor: '#ffffff' });
    const sh = createDiffuseProbeSH(p);
    assert.ok(Math.abs(sh.coefficients[0].x - Math.sqrt(4 * Math.PI)) < 0.001);
    const directional = createDiffuseProbeSH({ ...p, directionality: 0.65 });
    assert.ok(directional.coefficients[0].x < sh.coefficients[0].x);
    const rotated = createDiffuseProbeSH({ ...p, directionality: 0.65, axis: [1, 0, 0] });
    assert.notDeepEqual(rotated.coefficients, directional.coefficients);
});

test('editor starting view follows authored parent transforms and ignores disabled cameras', () => {
    const view = getPrefabEditorView({ root: { id: 'root', components: { t: { type: 'Transform', properties: { position: [0, 0, -15] } } }, children: [
        { id: 'disabled', disabled: true, components: { c: { type: 'Camera', properties: {} } } },
        { id: 'camera', components: { t: { type: 'Transform', properties: { position: [0, 17, 55], rotation: [0.16, 0, 0] } }, c: { type: 'Camera', properties: { fov: 60, far: 420, focus: 45 } } } },
    ] } });
    assert.deepEqual(view.position, [0, 17, 40]);
    assert.equal(view.fov, 60); assert.equal(view.far, 420);
    assert.ok(view.target[1] > 17); assert.ok(view.target[2] < 0);
});

test('sky uniform edits invalidate static environment capture without replacing its mesh or shader', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot } = await import('@react-three/fiber');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let store;
    const render = turbidity => act(async () => { store = root.render(h(SkyComponent.View, {
        properties: resolveComponentProperties(SkyComponent, { turbidity }), enabled: true,
    })); });
    await render(8);
    const sky = store.getState().scene.children.find(object => object.isSkyMesh);
    assert.ok(sky);
    const material = sky.material, revision = sky.userData.environmentVersion;
    await render(12);
    assert.equal(store.getState().scene.children.find(object => object.isSkyMesh), sky);
    assert.equal(sky.material, material);
    assert.equal(sky.turbidity.value, 12);
    assert.equal(sky.userData.environmentVersion, revision + 1);
    await render(12);
    assert.equal(sky.userData.environmentVersion, revision + 1, 'unchanged values do not force another environment capture');
});

test('changing postprocessing settings disposes every owned GPU pass, including on unmount', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot } = await import('@react-three/fiber');
    const { PassNode, RenderPipeline } = await import('three/webgpu');
    const { default: GTAONode } = await import('three/addons/tsl/display/GTAONode.js');
    const { default: BloomNode } = await import('three/addons/tsl/display/BloomNode.js');
    const { default: PostProcessing } = await import('../../src/runtime/components/PostProcessingComponent.tsx');
    const counts = { scene: 0, ao: 0, bloom: 0, pipeline: 0 };
    for (const [name, Type] of Object.entries({ scene: PassNode, ao: GTAONode, bloom: BloomNode, pipeline: RenderPipeline })) {
        const original = Type.prototype.dispose;
        Type.prototype.dispose = function () { counts[name]++; return original.call(this); };
        t.after(() => { Type.prototype.dispose = original; });
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    const renderer = { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas,
        getRenderTarget: () => null, setRenderTarget() {}, getMRT: () => null, setMRT() {} };
    await root.configure({ gl: renderer, size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    const render = radius => act(async () => root.render(h(PostProcessing.View, { properties: resolveComponentProperties(PostProcessing, { ambientOcclusion: true, bloom: true, ambientOcclusionRadius: radius }), enabled: true })));
    await render(0.25);
    await render(0.5);
    assert.deepEqual(counts, { scene: 1, ao: 1, bloom: 1, pipeline: 1 });
    await act(async () => root.render(null));
    assert.deepEqual(counts, { scene: 2, ao: 2, bloom: 2, pipeline: 2 });
});

test('scene root settings are explicit, live-editable and inherited without applying nested prefab settings', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group } = await import('three');
    const { createPrefabStore } = await import('../../src/core/prefabStore.ts');
    const { normalizePrefab } = await import('../../src/core/prefab.ts');
    const { PrefabRoot } = await import('../../src/runtime/prefabs/PrefabRoot.tsx');
    const { registerComponent } = await import('../../src/core/ComponentRegistry.ts');
    const { RenderPipeline } = await import('three/webgpu');
    const draws = { raw: 0, effects: 0 };
    t.mock.method(RenderPipeline.prototype, 'render', () => { draws.effects++; });
    extend({ Group }); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const nested = { root: { id: 'nested', components: { render: { type: 'RenderSettings', properties: { exposure: 7 } } } } };
    registerComponent({ name: 'NestedSettingsTest', properties: {}, View: () => h(PrefabRoot, { data: nested }) });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const renderer = { render() { draws.raw++; }, setSize() {}, setPixelRatio() {}, domElement: canvas,
        toneMapping: NoToneMapping, toneMappingExposure: 1.8, outputColorSpace: LinearSRGBColorSpace,
        shadowMap: { enabled: false, type: 1 },
        getRenderTarget: () => null, setRenderTarget() {}, getMRT: () => null, setMRT() {},
    };
    const root = createRoot(canvas);
    await root.configure({ gl: renderer, size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    const data = { root: { id: 'root', components: {}, children: [{ id: 'nested-host', components: { child: { type: 'NestedSettingsTest', properties: {} } } }] } };
    const store = createPrefabStore(data);
    let state;
    await act(async () => { state = root.render(h(PrefabRoot, { store })); });
    const baseline = { exposure: renderer.toneMappingExposure, mapping: renderer.toneMapping, space: renderer.outputColorSpace };
    assert.equal(baseline.exposure, 1.8, 'nested prefab presentation does not configure the outer scene');
    await act(async () => state.getState().advance(0.1, false));
    assert.deepEqual(draws, { raw: 1, effects: 0 }, 'without effects, a frame uses the host renderer');
    const update = components => act(async () => store.getState().restoreState(normalizePrefab({ ...data, root: { ...data.root, components } })));
    await update({ render: { type: 'RenderSettings', properties: {} }, post: { type: 'PostProcessing', properties: {} } });
    assert.equal(renderer.toneMappingExposure, baseline.exposure);
    assert.equal(renderer.toneMapping, baseline.mapping);
    assert.equal(renderer.outputColorSpace, baseline.space);
    await act(async () => state.getState().advance(0.2, false));
    assert.deepEqual(draws, { raw: 2, effects: 0 }, 'empty settings preserve normal rendering');
    await update({ render: { type: 'RenderSettings', properties: { exposure: 0.75, shadows: true } } });
    assert.equal(renderer.toneMappingExposure, 0.75);
    assert.equal(renderer.toneMapping, baseline.mapping);
    assert.equal(renderer.shadowMap.enabled, true);
    await act(async () => { await root.configure({ frameloop: 'never', size: { width: 110, height: 100, top: 0, left: 0 } }); });
    assert.equal(renderer.shadowMap.enabled, false, 'canvas reconfiguration reapplies its shadow default');
    await act(async () => state.getState().advance(1, false));
    assert.equal(renderer.shadowMap.enabled, true, 'authored settings survive canvas reconfiguration before rendering');
    await update({ post: { type: 'PostProcessing', properties: { bloom: true } } });
    assert.equal(renderer.toneMappingExposure, baseline.exposure);
    assert.equal(renderer.shadowMap.enabled, false);
    draws.raw = 0;
    await act(async () => state.getState().advance(2, false));
    assert.deepEqual(draws, { raw: 0, effects: 1 }, 'enabled effects render the composed frame exactly once');
    await update({});
    await act(async () => state.getState().advance(3, false));
    assert.deepEqual(draws, { raw: 1, effects: 1 }, 'removing effects restores normal rendering');
});

test('scene-scope components are discoverable and edits reject child placement or duplicate owners', () => {
    const { scope } = getComponent('ChunkSettings');
    assert.equal(scope, 'scene');
    const prefab = { root: { id: 'root', children: [{ id: 'child' }] } };
    assert.throws(() => evaluateSceneCommands(prefab, { commands: [{ op: 'component', id: 'child', key: 'chunking', component: { type: 'ChunkSettings', properties: {} } }] }), /scene root/);
    assert.throws(() => evaluateSceneCommands(prefab, { commands: [{ op: 'component', id: 'root', key: 'a', component: { type: 'ChunkSettings', properties: {} } },
        { op: 'component', id: 'root', key: 'b', component: { type: 'ChunkSettings', properties: {} } }] }), /exclusive group/);
    const replacement = { id: 'new-root', components: { chunking: { type: 'ChunkSettings', properties: {} } } };
    assert.equal(evaluateSceneCommands(prefab, { commands: [{ op: 'replaceNode', id: 'root', node: replacement }] }).prefab.root.id, 'new-root');
});

test('root chunk settings reconfigure the real mesh grid and restore its default when removed', async t => {
    const { act, createElement: h, useRef } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { createPrefabStore } = await import('../../src/core/prefabStore.ts');
    const { normalizePrefab } = await import('../../src/core/prefab.ts');
    const { PrefabRoot } = await import('../../src/runtime/prefabs/PrefabRoot.tsx');
    const { registerComponent } = await import('../../src/core/ComponentRegistry.ts');
    const { useGameObject } = await import('../../src/runtime/scene/SceneContext.tsx');
    const { useMeshInstanceRegistration } = await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    extend({ Group }); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    geometry.userData.prefabGeometrySignature = 'root-chunk-grid';
    registerComponent({ name: 'ChunkGridSource', properties: {}, View() {
        const mesh = useRef(new Mesh(geometry, material)), { id } = useGameObject();
        useMeshInstanceRegistration(id, mesh, true); return h('primitive', { object: mesh.current });
    } });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas }, size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); geometry.dispose(); material.dispose(); });
    const children = [0, 30].map((x, i) => ({ id: `mesh-${i}`, components: { source: { type: 'ChunkGridSource', properties: {} }, transform: { type: 'Transform', properties: { position: [x, 0, 0] } } } }));
    const data = size => ({ root: { id: 'root', components: size ? { chunks: { type: 'ChunkSettings', properties: { batchCellSize: size } } } : {}, children } });
    const store = createPrefabStore(data(10)); let state;
    await act(async () => { state = root.render(h(PrefabRoot, { store })); state.getState().advance(1, false); });
    const batches = () => { const found = []; state.getState().scene.traverse(o => { if (o.isInstancedMesh) found.push(o); }); return found; };
    await act(async () => state.getState().advance(2, false));
    assert.equal(batches().length, 0);
    await act(async () => store.getState().restoreState(normalizePrefab(data(64))));
    await act(async () => state.getState().advance(3, false));
    assert.equal(batches().length, 1); assert.equal(batches()[0].count, 2);
    await act(async () => store.getState().restoreState(normalizePrefab(data())));
    await act(async () => state.getState().advance(4, false));
    assert.equal(batches().length, 0);
});

test('authored clustered lighting changes live and releases its resources on removal', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group } = await import('three');
    const { PrefabRoot } = await import('../../src/runtime/prefabs/PrefabRoot.tsx');
    const { createPrefabStore } = await import('../../src/core/prefabStore.ts');
    const { ClusteredLighting } = await import('three/examples/jsm/lighting/ClusteredLighting.js');
    extend({ Group }); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const fallback = {}, renderer = { lighting: fallback, render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas };
    const root = createRoot(canvas);
    await root.configure({ gl: renderer, size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    const document = createPrefabStore({ root: { id: 'root' } });
    let disposals = 0;
    const dispose = ClusteredLighting.prototype.dispose;
    ClusteredLighting.prototype.dispose = function () { disposals++; return dispose.call(this); };
    t.after(async () => { await act(async () => root.unmount()); ClusteredLighting.prototype.dispose = dispose; });
    await act(async () => root.render(h(PrefabRoot, { store: document })));
    assert.equal(renderer.lighting, fallback, 'absence retains Three lighting');
    const update = properties => act(async () => document.getState().updateNode('root', node => ({ ...node,
        components: properties ? { lights: { type: 'ClusteredLighting', properties } } : {},
    })));
    await update({ maxLights: 32 });
    assert.equal(renderer.lighting.maxLights, 32);
    assert.equal(renderer.lighting.tileSize, 32);
    await update({ maxLights: 128, tileSize: 16 });
    assert.equal(renderer.lighting.maxLights, 128);
    assert.equal(renderer.lighting.tileSize, 16);
    assert.equal(disposals, 1);
    await update(null);
    assert.equal(renderer.lighting, fallback);
    assert.equal(disposals, 2);
});

test('declarative fog restores the host scene and probe edits preserve the light object', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Fog, Group, LightProbe, Scene } = await import('three');
    const { PrefabRoot } = await import('../../src/runtime/prefabs/PrefabRoot.tsx');
    const { createPrefabStore } = await import('../../src/core/prefabStore.ts');
    extend({ Fog, Group, LightProbe }); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const scene = new Scene(), originalFog = new Fog('#123456', 3, 40);
    scene.fog = originalFog;
    const root = createRoot(canvas);
    await root.configure({ scene, gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    const store = createPrefabStore({ root: { id: 'world', children: [
        { id: 'fog', components: { fog: { type: 'Fog', properties: { color: '#abcdef', near: 5, far: 80 } } } },
        { id: 'probe', components: { probe: { type: 'DiffuseLightProbe', properties: { intensity: 0.3 } } } },
    ] } });
    await act(async () => root.render(h(PrefabRoot, { store })));
    assert.equal(scene.fog.color.getHexString(), 'abcdef');
    assert.equal(scene.fog.far, 80);
    let probe;
    scene.traverse(object => { if (object.isLightProbe) probe = object; });
    assert.ok(probe);
    const before = probe.sh.coefficients[0].clone();
    await act(async () => store.getState().updateNode('probe', node => ({ ...node, components: {
        probe: { type: 'DiffuseLightProbe', properties: { intensity: 0.8, skyColor: '#ffffff' } },
    } })));
    assert.ok(probe.parent, 'editing probe values keeps the existing light mounted');
    assert.equal(probe.intensity, 0.8);
    assert.notDeepEqual(probe.sh.coefficients[0], before);
    await act(async () => {
        for (const id of ['fog', 'probe']) store.getState().updateNode(id, node => ({ ...node, components: {} }));
    });
    assert.equal(scene.fog, originalFog);
    assert.equal(probe.parent, null);
});
