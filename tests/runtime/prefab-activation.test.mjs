import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, StrictMode, useEffect } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Group } from 'three';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { PrefabInstance } from '../../src/runtime/prefabs/PrefabInstance.tsx';
import { AssetRuntimeContext } from '../../src/runtime/assets/AssetRuntime.tsx';
import { ComponentLookupContext } from '../../src/runtime/prefabs/nodePlan.ts';

const model = id => ({ id, name: id, components: { model: { type: 'Model', properties: {} } } });

test('prefab activation preserves descendants and active siblings', async t => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    extend({ Group });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => {
        await act(async () => root.unmount());
    });
    const starts = [], stops = [], updates = [], readyRefs = [];
    const statuses = [];
    let streamerMounts = 0;
    let finishLoading;
    const preparation = new Promise(resolve => { finishLoading = resolve; });
    const runtime = { preparePrefab: () => preparation };
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
            ids.map(id => h(PrefabRoot, { key: id, id, enabled, data: id === 'host' ? hostDocument : document })))));
    });
    await render(['a']);
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
    assert.deepEqual(updates, ['a/root', 'b/root']);
    assert.ok(starts.includes('b/root'));
    assert.equal(stops.filter(id => id === 'a/root').length, activeStops, 'mounting a sibling does not deactivate the first prefab');
    await render(['a']);
    assert.equal(starts.filter(id => id === 'a/root').length, activeStarts, 'removing a sibling does not restart the first prefab');
    assert.ok(stops.includes('b/root'));
    assert.ok(readyRefs.length > 0 && readyRefs.every(Boolean), 'all descendant objects are mounted before setup');
    await render(['host']);
    const initialMounts = streamerMounts;
    assert.ok(statuses.includes('loading'));
    assert.ok(!statuses.includes('active'));
    await act(async () => finishLoading({ document: { root: model('streamed-mesh') }, durationMs: 0 }));
    await render(['host']);
    assert.equal(streamerMounts, initialMounts, 'a streamed placement must not disable and remount its host streamer');
    assert.ok(statuses.includes('active'), 'the streamed chunk finishes mounting and compilation');
    assert.ok(state.getState().scene.getObjectByName('streamed-mesh'));
});
