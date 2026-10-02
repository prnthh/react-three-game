import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { CubeCamera, Group, Texture } from 'three';
import Environment from '../../src/runtime/components/EnvironmentComponent.tsx';
import { PrefabStoreProvider } from '../../src/runtime/prefabs/PrefabStoreContext.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { AssetRuntimeProvider, useAssetRuntime } from '../../src/runtime/assets/AssetRuntime.tsx';

extend({ CubeCamera, Group });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('environment refreshes its capture without remounting children or replacing the render target', async t => {
    let capturedScene, captures = 0, runtime;
    t.mock.method(CubeCamera.prototype, 'update', function (_, scene) { capturedScene = scene; captures++; });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    function Probe() { runtime = useAssetRuntime(); return null; }
    const children = h('group', { name: 'environment-content' });
    const document = createPrefabStore({ root: { id: 'root' } });
    let store;
    const render = async (intensity, content = children) => act(async () => {
        store = root.render(h(AssetRuntimeProvider, null, h(Probe),
            h(PrefabStoreProvider, { store: document }, h(Environment.View, { properties: { intensity } }, content))));
    });
    await render(1);
    const content = capturedScene.getObjectByName('environment-content');
    const texture = store.getState().scene.environment;
    assert.ok(content);
    let previousCaptures = captures;
    await render(2);
    assert.ok(captures > previousCaptures);
    assert.equal(store.getState().scene.environmentIntensity, 2);
    assert.ok(capturedScene.getObjectByName('environment-content') === content);
    assert.ok(store.getState().scene.environment === texture);
    previousCaptures = captures;
    await act(async () => runtime.registerTexture('test-texture', new Texture()));
    assert.equal(captures, previousCaptures, 'unrelated loaded imagery does not refresh this environment');
    await render(2, h('group', { name: 'environment-content', position: [1, 0, 0] }));
    assert.ok(captures > previousCaptures, 'child prop changes refresh the capture');
    assert.equal(content.position.x, 1);
    assert.ok(capturedScene.getObjectByName('environment-content') === content);
    assert.ok(store.getState().scene.environment === texture);
});
