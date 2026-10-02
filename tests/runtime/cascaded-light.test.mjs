import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { CascadedDirectionalLight } from '../../src/runtime/lighting/CascadedDirectionalLight.tsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('camera switches update CSM frustums without replacing the light or shadow node', async t => {
    const updates = t.mock.method(CSMShadowNode.prototype, 'updateFrustums', () => {});
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let store;
    await act(async () => { store = root.render(h(CascadedDirectionalLight)); });
    const light = store.getState().scene.children[0];
    const csm = light.shadow.shadowNode;
    const editorCamera = store.getState().camera;
    // Three assigns this on shader setup; this test runs without a GPU.
    csm.camera = editorCamera;
    const playCamera = new PerspectiveCamera(75, 1, 0.1, 1000);
    let time = 0;
    for (const camera of [playCamera, editorCamera, playCamera]) {
        await act(async () => store.getState().set({ camera }));
        await act(async () => store.getState().advance(time += 0.016, false));
        assert.ok(store.getState().scene.children[0] === light, 'keep lighting pipeline identity');
        assert.ok(light.shadow.shadowNode === csm, 'keep shadow resources');
        assert.equal(csm.camera, camera);
    }
    assert.equal(updates.mock.callCount(), 3);
    await act(async () => store.getState().advance(time += 0.016, false));
    assert.equal(updates.mock.callCount(), 3, 'unchanged cameras do not rebuild frustums');
    playCamera.fov = 60;
    playCamera.updateProjectionMatrix();
    await act(async () => store.getState().advance(time += 0.016, false));
    assert.equal(updates.mock.callCount(), 4);
});
