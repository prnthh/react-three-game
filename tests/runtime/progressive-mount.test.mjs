import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, StrictMode, useEffect } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Group } from 'three';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { PrefabInstance } from '../../src/runtime/prefabs/PrefabInstance.tsx';
import { AssetRuntimeContext } from '../../src/runtime/assets/AssetRuntime.tsx';
import { ComponentLookupContext } from '../../src/runtime/prefabs/nodePlan.ts';
import { PrefabMountScope, ProgressiveMountProvider } from '../../src/runtime/prefabs/ProgressiveMount.tsx';

const model = id => ({ id, name: id, components: { model: { type: 'Model', properties: {} } } });

test('scopes include nested work, release cancelled tasks once, and isolate siblings', () => {
    const parent = new PrefabMountScope(), nested = new PrefabMountScope(parent), sibling = new PrefabMountScope();
    parent.commit(); nested.commit(); sibling.commit();
    const release = nested.begin();
    assert.equal(parent.getSnapshot(), true);
    assert.equal(nested.getSnapshot(), true);
    assert.equal(sibling.getSnapshot(), false);
    release(); release();
    assert.equal(parent.getSnapshot(), false);
    assert.equal(nested.getSnapshot(), false);
    const another = nested.begin();
    assert.equal(parent.getSnapshot(), true);
    another();
    assert.equal(parent.getSnapshot(), false);
});

test('batched prefab activation waits for descendants without pausing active siblings', async t => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    extend({ Group });
    const callbacks = new Map();
    let nextFrame = 0;
    const originalRequest = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = callback => { callbacks.set(++nextFrame, callback); return nextFrame; };
    globalThis.cancelAnimationFrame = id => callbacks.delete(id);
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => {
        await act(async () => root.unmount());
        globalThis.requestAnimationFrame = originalRequest;
        globalThis.cancelAnimationFrame = originalCancel;
    });
    const starts = [], stops = [], updates = [], readyRefs = [];
    const statuses = [];
    let streamerMounts = 0;
    const runtime = { preparePrefab: async () => ({ document: { root: model('streamed-mesh') }, durationMs: 0 }) };
    const nestedDocument = { root: model('nested-mesh') };
    const definitions = {
        Model: { name: 'Model', slot: 'object', renderWhenDisabled: true, properties: {}, View: ({ children }) => children },
        Nested: { name: 'Nested', renderWhenDisabled: true, properties: {},
            View: ({ enabled, children }) => h(GroupView, null, h(PrefabRoot, { id: 'nested', data: nestedDocument, enabled }), children) },
        Gameplay: { name: 'Gameplay', properties: {},
            setup(ctx) {
                readyRefs.push(!!ctx.prefab.getObject('leaf'));
                starts.push(ctx.node.id);
                return () => stops.push(ctx.node.id);
            },
            update(ctx) { updates.push(ctx.node.id); } },
        Streamer: { name: 'Streamer', properties: {}, View() {
            useEffect(() => { streamerMounts++; }, []);
            return h(AssetRuntimeContext.Provider, { value: runtime }, h(PrefabInstance, {
                id: 'chunk', url: '/chunk.json', onStatus: status => statuses.push(status.phase),
            }));
        } },
    };
    function GroupView({ children }) { return h('group', null, children); }
    const document = { root: { id: 'root', components: { gameplay: { type: 'Gameplay', properties: {} } },
        children: [{ ...model('branch'), components: { model: { type: 'Model', properties: {} }, nested: { type: 'Nested', properties: {} } }, children: [model('leaf')] }] } };
    const hostDocument = { root: { id: 'host-root', components: { streamer: { type: 'Streamer', properties: {} } } } };
    let state;
    const render = async (ids, enabled = true) => act(async () => {
        state = root.render(h(StrictMode, null, h(ComponentLookupContext.Provider, { value: name => definitions[name] },
            h(ProgressiveMountProvider, { batchSize: 1 }, ids.map(id => h(PrefabRoot, { key: id, id, enabled, data: id === 'host' ? hostDocument : document }))))));
    });
    const tick = async () => act(async () => {
        const pending = [...callbacks.values()]; callbacks.clear();
        pending.forEach(callback => callback(0));
    });
    await render(['a']);
    assert.deepEqual(starts, []);
    await tick();
    assert.deepEqual(starts, [], 'admitting the parent must not activate before newly enqueued children');
    await tick();
    assert.deepEqual(starts, [], 'nested prefab work also holds the owning root');
    await tick();
    assert.ok(starts.includes('a/root'));
    const leaf = state.getState().scene.getObjectByName('leaf');
    assert.ok(leaf);
    const callbacksBefore = state.getState().internal.subscribers.length;
    await render(['a'], false);
    assert.equal(state.getState().scene.getObjectByName('leaf'), leaf, 'disabling viewless behavior preserves descendants');
    assert.ok(state.getState().internal.subscribers.length < callbacksBefore, 'disabled behavior releases its frame subscription');
    await render(['a']);
    assert.equal(state.getState().scene.getObjectByName('leaf'), leaf, 'reenabling uses React reconciliation without remounting descendants');
    const activeStarts = starts.length, activeStops = stops.length;
    await render(['a', 'b']);
    await act(async () => state.getState().advance(1, false));
    assert.deepEqual(updates, ['a/root']);
    assert.equal(starts.length, activeStarts);
    assert.equal(stops.length, activeStops, 'loading a sibling does not deactivate the first prefab');
    await tick();
    await render(['a']);
    await tick();
    assert.equal(starts.length, activeStarts, 'cancelled sibling work never activates');
    assert.equal(stops.length, activeStops);
    await render(['a', 'b']);
    await tick(); await tick(); await tick();
    assert.ok(starts.includes('b/root'), 'the second prefab activates after its own subtree finishes');
    assert.equal(starts.filter(id => id === 'a/root').length, activeStarts);
    assert.ok(readyRefs.length > 0 && readyRefs.every(Boolean), 'all descendant objects are mounted before setup');
    await render(['host']);
    const initialMounts = streamerMounts;
    await tick();
    assert.equal(streamerMounts, initialMounts, 'a streamed placement must not disable and remount its host streamer');
    assert.ok(statuses.includes('active'), 'the streamed chunk finishes mounting and compilation');
    assert.ok(state.getState().scene.getObjectByName('streamed-mesh'));
});
