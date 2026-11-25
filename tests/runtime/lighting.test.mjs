import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AmbientLight, AudioContext, Color, DirectionalLight, Group, HemisphereLight, Object3D, PointLight, SpotLight, Texture } from 'three';
import { AssetCacheContext, createAssetCache } from '../../src/runtime/assets/assetCache.ts';
import { PrefabRoot, createPrefabStore } from '../../src/viewer/index.ts';

test('sparse light documents use schema defaults and edits preserve falsy values and light identity', async t => {
    extend({ AmbientLight, DirectionalLight, Group, HemisphereLight, Object3D, PointLight, SpotLight });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    const types = ['AmbientLight', 'DirectionalLight', 'HemisphereLight', 'PointLight', 'SpotLight'];
    const document = createPrefabStore({ root: { id: 'root', children: types.map(type => ({
        id: type, components: { light: { type, properties: {} } }, children: [{ id: type + '-child', name: type + ' child' }],
    })) } });
    let resolveMap;
    const pendingMap = new Promise(resolve => { resolveMap = resolve; });
    const cache = createAssetCache({ texture: () => pendingMap });
    t.after(() => cache.dispose());
    const updateLight = (type, properties) => document.getState().updateNode(type, node => ({
        ...node, components: { light: { type, properties } },
    }));
    updateLight('SpotLight', { map: '/cookie.png' });
    let store;
    await act(async () => { store = root.render(h(AssetCacheContext.Provider, { value: cache }, h(PrefabRoot, { store: document }))); });
    const lights = new Map();
    store.getState().scene.traverse(object => { if (object.isLight) lights.set(object.type, object); });
    assert.equal(lights.size, types.length);
    for (const light of lights.values()) {
        assert.equal(light.intensity, 1);
        assert.ok(light.color.equals(new Color('#ffffff')));
        if (light.shadow) {
            assert.equal(light.castShadow, false);
            assert.equal(light.shadow.mapSize.x, 512);
            assert.equal(light.shadow.camera.near, 0.5);
        }
    }
    for (const type of ['PointLight', 'SpotLight', 'DirectionalLight']) {
        assert.equal(store.getState().scene.getObjectByName(type + ' child').parent, lights.get(type));
    }
    for (const type of ['AmbientLight', 'HemisphereLight']) {
        assert.equal(store.getState().scene.getObjectByName(type + ' child').parent, lights.get(type).parent);
    }
    const spot = lights.get('SpotLight');
    const child = spot.getObjectByName('SpotLight child');
    assert.equal(spot.map, null);
    const cookie = new Texture();
    await act(async () => resolveMap(cookie));
    assert.equal(spot.map, cookie);
    assert.ok(spot.getObjectByName('SpotLight child') === child);
    await act(async () => updateLight('SpotLight', {}));
    assert.equal(spot.map, null);
    const hemisphere = lights.get('HemisphereLight');
    await act(async () => updateLight('HemisphereLight', { skyColor: '#abcdef', groundColor: '#123456', intensity: 0 }));
    assert.ok(hemisphere.parent && hemisphere.color.equals(new Color('#abcdef')));
    assert.ok(hemisphere.groundColor.equals(new Color('#123456')));
    assert.equal(hemisphere.intensity, 0);
    const point = lights.get('PointLight');
    const patch = properties => act(async () => updateLight('PointLight', properties));
    await patch({ intensity: 0, color: '#804020', shadowAutoUpdate: false, shadowMapSize: 1024 });
    assert.equal(point.intensity, 0);
    assert.ok(point.color.equals(new Color('#804020')));
    assert.equal(point.shadow.autoUpdate, false);
    assert.equal(point.shadow.mapSize.x, 1024);
    await patch({ intensity: undefined, color: undefined, shadowAutoUpdate: undefined });
    assert.equal(point.intensity, 1);
    assert.ok(point.color.equals(new Color('#ffffff')));
    assert.equal(point.shadow.autoUpdate, true);
    assert.equal(point.shadow.mapSize.x, 512);
    assert.equal(point.parent.children.find(object => object.isPointLight), point);
});

test('editor helper updates follow selection and release their frame subscriptions in Play', async t => {
    const { NodeSelectionContext } = await import('../../src/runtime/scene/SceneContext.tsx');
    extend(await import('three'));
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {} },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    const document = createPrefabStore({ root: { id: 'root', children: ['SpotLight', 'PointLight', 'DirectionalLight', 'Camera'].map(type => ({
        id: type, components: { source: { type, properties: { castShadow: true } } },
    })) } });
    const selection = id => ({ subscribe: () => () => {}, getSelectedId: () => id });
    let store;
    const show = (editMode, id) => act(async () => {
        store = root.render(h(NodeSelectionContext.Provider, { value: selection(id) }, h(PrefabRoot, { store: document, editMode })));
    });
    await show(true, null);
    const subscribers = () => store.getState().internal.subscribers.length;
    const helpers = () => store.getState().scene.children.filter(o => o.type.endsWith('Helper'));
    await act(async () => store.getState().advance(0, false));
    const idle = subscribers();
    for (const [id, expected] of [['SpotLight', ['CameraHelper', 'SpotLightHelper']], ['PointLight', ['PointLightHelper']],
        ['DirectionalLight', ['CameraHelper']], ['Camera', ['CameraHelper']]]) {
        await show(true, id);
        assert.deepEqual(helpers().map(o => o.type).sort(), expected);
        assert.equal(subscribers(), idle + expected.length);
        await act(async () => store.getState().advance(1, false));
    }
    await show(false, 'Camera');
    assert.deepEqual(helpers(), []);
    assert.equal(subscribers(), idle);
});
