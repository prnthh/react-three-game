import test from 'node:test';
import assert from 'node:assert/strict';
import { createFollowState, stepCameraFollow } from '../../src/runtime/components/lightUtils.tsx';

test('shadow follow requires both a timer sample and a new grid cell', () => {
    const state = createFollowState();
    const step = (dt, x, z) => stepCameraFollow(state, dt, x, z, 0.25, 8);
    assert.equal(step(0, 17, -18), true, 'initial camera placement is immediate');
    assert.deepEqual([state.x, state.z], [16, -16]);
    assert.equal(step(0.125, 30, -30), false, 'crossing cells does not bypass the timer');
    assert.deepEqual([state.x, state.z], [16, -16]);
    assert.equal(step(0.125, 30, -30), true);
    assert.deepEqual([state.x, state.z], [32, -32]);
    assert.equal(step(0.25, 33, -31), false, 'movement within a cell leaves the light still');
    assert.equal(step(3, -60, 72), true, 'a suspended frame samples only the current location');
    assert.deepEqual([state.x, state.z], [-56, 72]);
    assert.ok(state.elapsed < 0.25);
    assert.equal(step(0, 100, 100), false, 'no catch-up burst');
});

import { act, createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, DirectionalLight, Group, Vector3 } from 'three';
import { PrefabRoot, createPrefabStore } from 'react-three-game/viewer';
import DirectionalLightEditor from '../../src/editor/components/DirectionalLightComponent.editor.tsx';

test('follow options appear only when Follow camera is enabled', () => {
    const render = followCamera => renderToStaticMarkup(h(DirectionalLightEditor, {
        node: { id: 'sun' }, properties: { followCamera }, update() {},
    }));
    assert.ok(!render(false).includes('Step size (X/Z)'));
    assert.ok(render(true).includes('Step size (X/Z)'));
    assert.ok(render(true).includes('Update interval (s)'));
});

test('directional light follow preserves height and direction and resets when disabled', async t => {
    extend({ Group, DirectionalLight });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    const doc = createPrefabStore({ root: { id: 'parent', components: {
        transform: { type: 'Transform', properties: { position: [4, 7, 9], rotation: [0.2, 0.5, 0], scale: [2, 2, 2] } },
    }, children: [{ id: 'sun', components: {
        transform: { type: 'Transform', properties: { position: [-25, 60, -40] } },
        light: { type: 'DirectionalLight', properties: { followCamera: true, followCameraStep: 8,
            followCameraInterval: 0.25, targetOffset: [25, -67.5, 40], shadowAutoUpdate: false } },
    } }] } });
    let store;
    await act(async () => { store = root.render(h(PrefabRoot, { store: doc, editMode: false })); });
    const state = store.getState();
    let light;
    state.scene.traverse(object => { if (object.isDirectionalLight) light = object; });
    assert.ok(light);
    const position = () => light.getWorldPosition(new Vector3());
    const direction = () => light.target.getWorldPosition(new Vector3()).sub(position()).normalize();
    const original = position(), originalDirection = direction();
    state.camera.position.set(17, 100, -18);
    await act(async () => state.advance(0.01, false));
    assert.ok(position().distanceTo(original.clone().add(new Vector3(16, 0, -16))) < 1e-8);
    assert.ok(direction().distanceTo(originalDirection) < 1e-8);
    assert.equal(light.shadow.needsUpdate, true, 'moving refreshes even a manually updated shadow');
    state.camera.position.set(17, 300, -18);
    await act(async () => state.advance(0.3, false));
    assert.ok(Math.abs(position().y - original.y) < 1e-8, 'camera height has no effect');
    await act(async () => doc.getState().updateNode('sun', node => ({ ...node, components: {
        ...node.components, light: { ...node.components.light, properties: { ...node.components.light.properties, followCamera: false } },
    } })));
    assert.ok(position().distanceTo(original) < 1e-8);
    state.camera.position.set(80, 300, 80);
    await act(async () => state.advance(1, false));
    assert.ok(position().distanceTo(original) < 1e-8, 'disabled following stays at the authored position');
});
