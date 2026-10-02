import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group, Mesh, Texture } from 'three';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import Material, { MaterialOverridesProvider } from '../../src/runtime/components/MaterialComponent.tsx';
import Geometry from '../../src/runtime/components/GeometryComponent.tsx';
import { ConcreteMaterialComponent } from '../../docs/app/demo/jumper/components/ConcreteMaterialComponent.tsx';
import { assetLoaders } from '../../src/runtime/assets/assetCache.ts';
import { AssetBoundary } from '../../src/runtime/assets/AssetBoundary.tsx';

extend({ Group, Mesh });
registerComponent(Material); registerComponent(Geometry); registerComponent(ConcreteMaterialComponent);
registerComponent({ name: 'MaterialTestMesh', slot: 'object', properties: {}, View: ({ children }) => h('mesh', null, children) });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('atomic materials wait for textures, share concrete variants and keep per-object overrides local', async t => {
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const loads = t.mock.method(assetLoaders, 'texture', () => pending);
    const source = new Texture();
    const doc = createPrefabStore({ materials: { painted: { texture: '/material-readiness.png' } }, root: { id: 'root', children: ['a', 'b'].map(id => ({ id, name: id, components: {
        mesh: { type: 'MaterialTestMesh', properties: {} },
        geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
        material: { type: 'ConcreteMaterial', properties: { materialId: 'painted' } },
    } })) } });
    let state;
    const render = async overrides => act(async () => { state = root.render(h(AssetBoundary, { atomic: true },
        h(MaterialOverridesProvider, { overrides }, h(PrefabRoot, { store: doc })))); });
    await render({});
    assert.equal(state.getState().scene.getObjectByName('a'), undefined);
    await act(async () => { finish(source); await pending; });
    const mesh = id => state.getState().scene.getObjectByName(id).children.find(object => object.isMesh);
    const a = mesh('a'), b = mesh('b');
    assert.equal(a.material, b.material, 'identical concrete variants share a batchable material');
    assert.notEqual(a.material.map, source, 'texture configuration never mutates the shared source');
    assert.equal(loads.mock.callCount(), 1);
    const original = a.material;
    await act(async () => doc.getState().updateNode('a', node => ({ ...node, components: { ...node.components,
        material: { type: 'ConcreteMaterial', properties: { materialId: 'painted', weathering: 0.2 } },
    } })));
    assert.notEqual(a.material, b.material);
    assert.equal(b.material, original);
    await render({ wireframe: true });
    assert.equal(a.material.wireframe, true);
    assert.equal(b.material.wireframe, true);
    assert.notEqual(a.material, b.material, 'outer per-object overrides do not opt into sharing');
});
