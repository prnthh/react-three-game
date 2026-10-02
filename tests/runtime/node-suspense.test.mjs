import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, Fragment, Suspense } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group } from 'three';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';

extend({ Group });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('an asset-local boundary leaves descendants, siblings, and controls mounted', async t => {
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas }, size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => {
        await act(async () => root.unmount());
        globalThis.window = previousWindow;
    });
    let resolve, loaded = false;
    const pending = new Promise(done => { resolve = done; });
    function LoadedAsset() {
        if (!loaded) throw pending;
        return h('group', { name: 'loaded-content' });
    }
    registerComponent({ name: 'StreamingTest', properties: {}, View: ({ children }) =>
        h(Fragment, null, h(Suspense, { fallback: null }, h(LoadedAsset)), children) });
    let store;
    await act(async () => {
        store = root.render(h(Fragment, null,
            h('group', { name: 'controls' }),
            h(PrefabRoot, { editMode: true, data: { root: { id: 'root', children: [
                { id: 'slow', name: 'slow-transform', components: { loader: { type: 'StreamingTest', properties: {} } },
                    children: [{ id: 'child', name: 'ready-child' }] },
                { id: 'fast', name: 'fast-sibling' },
            ] } } })));
    });
    const scene = store.getState().scene;
    const fast = scene.getObjectByName('fast-sibling');
    const slow = scene.getObjectByName('slow-transform');
    assert.ok(fast, 'ready siblings mount immediately, without waiting for animation frames');
    assert.ok(slow);
    const child = scene.getObjectByName('ready-child');
    assert.ok(child, 'loading an asset does not gate its node descendants');
    assert.ok(scene.getObjectByName('controls'));
    assert.equal(scene.getObjectByName('loaded-content'), undefined);
    await act(async () => { loaded = true; resolve(); await pending; });
    assert.ok(scene.getObjectByName('loaded-content'));
    assert.equal(scene.getObjectByName('fast-sibling'), fast);
    assert.equal(scene.getObjectByName('slow-transform'), slow);
    assert.equal(scene.getObjectByName('ready-child'), child);
});
