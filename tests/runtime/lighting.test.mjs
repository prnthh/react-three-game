import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AmbientLight, AudioContext, Color, DirectionalLight, Group, HemisphereLight, Object3D, PointLight, SpotLight } from 'three';
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
        id: type, components: { light: { type, properties: {} } },
    })) } });
    let store;
    await act(async () => { store = root.render(h(PrefabRoot, { store: document })); });
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
    const point = lights.get('PointLight');
    const patch = properties => act(async () => document.getState().updateNode('PointLight', node => ({
        ...node, components: { light: { type: 'PointLight', properties } },
    })));
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
