import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group } from 'three';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import Model from '../../src/runtime/components/ModelComponent.tsx';
import { assetLoaders } from '../../src/runtime/assets/assetCache.ts';
import { AssetBoundary } from '../../src/runtime/assets/AssetBoundary.tsx';

extend({ Group });
registerComponent(Model);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const atomic of [false, true]) test(`model loading and errors respect ${atomic ? 'whole-instance' : 'asset-local'} boundaries`, async t => {
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});
    let fail;
    const pending = new Promise((_, reject) => { fail = reject; });
    let attempts = 0;
    t.mock.method(assetLoaders, 'model', async () => {
        if (++attempts === 1) return pending;
        const model = new Group(); model.name = 'loaded-model'; return model;
    });
    const doc = createPrefabStore({ root: { id: 'root', children: [
        { id: 'slow', name: 'slow', components: { model: { type: 'Model', properties: { filename: `/boundary-${atomic}.glb` } } },
            children: [{ id: 'child', name: 'ready-child' }] },
        { id: 'sibling', name: 'ready-sibling' },
    ] } });
    let state;
    await act(async () => { state = root.render(h(AssetBoundary, { atomic, subscribeToRetry: doc.subscribe }, h(PrefabRoot, { store: doc }))); });
    const scene = state.getState().scene;
    const child = scene.getObjectByName('ready-child');
    assert.equal(Boolean(child), !atomic);
    assert.equal(Boolean(scene.getObjectByName('ready-sibling')), !atomic);
    await act(async () => { fail(new Error('offline')); await pending.catch(() => {}); });
    assert.equal(scene.getObjectByName('ready-child'), child, 'failure leaves ready descendants intact in ordinary scenes');
    await act(async () => doc.getState().updateNode('slow', node => ({ ...node, name: 'retry' })));
    assert.ok(scene.getObjectByName('loaded-model'));
    assert.ok(scene.getObjectByName('ready-child'));
    if (!atomic) assert.equal(scene.getObjectByName('ready-child'), child);
    assert.equal(attempts, 2);
});
