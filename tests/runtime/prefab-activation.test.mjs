import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, StrictMode, useEffect } from 'react';
import { createRoot, extend, useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { useComponentActive, useGameObject, usePrefab } from '../../src/viewer/index.ts';
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
    const statuses = [], activeVisibility = [];
    let streamerMounts = 0;
    let finishLoading;
    const preparation = new Promise(resolve => { finishLoading = resolve; });
    const runtime = { preparePrefab: (_source, options) => {
        assert.equal(options.basePath, '/assets');
        return preparation;
    } };
    const nestedDocument = { root: model('nested-mesh') };
    const definitions = {
        Model: { name: 'Model', slot: 'object', renderWhenDisabled: true, properties: {}, View: ({ children }) => children },
        Nested: { name: 'Nested', renderWhenDisabled: true, properties: {},
            View: ({ enabled, children }) => h(GroupView, null, h(PrefabRoot, { id: 'nested', data: nestedDocument, enabled }), children) },
        Gameplay: { name: 'Gameplay', renderWhenDisabled: true, properties: {},
            View({ enabled, children }) {
                const active = useComponentActive(enabled);
                return h(GroupView, null, active ? h(GameplayEffect) : null, children);
            } },
        Streamer: { name: 'Streamer', properties: {}, View() {
            useEffect(() => { streamerMounts++; }, []);
            return h(AssetRuntimeContext.Provider, { value: runtime }, h(PrefabInstance, {
                id: 'chunk', source: '/chunk.json', onStatus: status => {
                    statuses.push(status.phase);
                    if (status.phase !== 'active') return;
                    let object = state.getState().scene.getObjectByName('streamed-mesh');
                    let visible = Boolean(object);
                    for (; object; object = object.parent) visible = visible && object.visible;
                    activeVisibility.push(visible);
                },
            }));
        } },
    };
    function GameplayEffect() {
        const node = useGameObject(), prefab = usePrefab();
        useEffect(() => {
            readyRefs.push(!!prefab.getObject('leaf'));
            starts.push(node.id);
            return () => stops.push(node.id);
        }, [node, prefab]);
        useFrame(() => updates.push(node.id));
        return null;
    }
    function GroupView({ children }) { return h('group', null, children); }
    const document = { root: { id: 'root', components: { gameplay: { type: 'Gameplay', properties: {} } },
        children: [{ ...model('branch'), components: { model: { type: 'Model', properties: {} }, nested: { type: 'Nested', properties: {} } }, children: [model('leaf')] }] } };
    const hostDocument = { root: { id: 'host-root', components: { streamer: { type: 'Streamer', properties: {} } } } };
    let state;
    const render = async (ids, enabled = true) => act(async () => {
        state = root.render(h(StrictMode, null, h(ComponentLookupContext.Provider, { value: name => definitions[name] },
            ids.map(id => h(PrefabRoot, { key: id, id, enabled, basePath: '/assets', data: id === 'host' ? hostDocument : document })))));
    });
    await render(['a']);
    assert.ok(starts.includes('a/root'));
    const leaf = state.getState().scene.getObjectByName('leaf');
    assert.ok(leaf);
    await render(['a'], false);
    assert.equal(state.getState().scene.getObjectByName('leaf'), leaf, 'disabling viewless behavior preserves descendants');
    await act(async () => state.getState().advance(0.5, false));
    assert.deepEqual(updates, [], 'disabled behavior performs no frame work');
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
    await act(async () => finishLoading({ root: model('streamed-mesh') }));
    await render(['host']);
    assert.equal(streamerMounts, initialMounts, 'a streamed placement must not disable and remount its host streamer');
    await act(async () => state.getState().advance(2, false));
    assert.ok(statuses.includes('active'), 'the streamed chunk finishes mounting and compilation after its first rendering frame');
    assert.ok(state.getState().scene.getObjectByName('streamed-mesh'));
    assert.deepEqual(activeVisibility, [true], 'activation observes an already visible prefab');
});

test('editing leaf components preserves sibling effects, wrappers and authored children', async t => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    extend({ Group });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(() => act(async () => root.unmount()));
    const events = [];
    function Leaf({ properties }) {
        useEffect(() => {
            events.push('start ' + properties.name);
            return () => events.push('stop ' + properties.name);
        }, []);
        return null;
    }
    function Wrapper({ children }) { return h('group', { name: 'wrapper' }, children); }
    const definitions = {
        Leaf: { slot: 'leaf', properties: {}, View: Leaf },
        Wrapper: { properties: {}, View: Wrapper },
    };
    const lookup = name => definitions[name];
    const render = async (keys, hidden = false) => {
        const components = Object.fromEntries(keys.map(name => [name, {
            type: name === 'wrapper' ? 'Wrapper' : 'Leaf', properties: { name },
        }]));
        const data = { root: { id: 'parent', hidden, components, children: [{ id: 'child', name: 'child', components: {} }] } };
        let store;
        await act(async () => { store = root.render(h(ComponentLookupContext.Provider, { value: lookup },
            h(PrefabRoot, { id: 'placement', data }))); });
        return store.getState().scene;
    };
    const scene = await render(['a', 'wrapper', 'b']);
    const wrapper = scene.getObjectByName('wrapper'), child = scene.getObjectByName('child');
    assert.ok(wrapper && child && wrapper.getObjectByName('child') === child);
    const initial = events.length;
    await render(['extra', 'a', 'wrapper', 'inside', 'b']);
    await render(['a', 'extra', 'wrapper', 'b', 'inside']);
    await render(['wrapper', 'b']);
    await render(['wrapper', 'b'], true);
    await render(['wrapper', 'b']);
    assert.ok(scene.getObjectByName('wrapper') === wrapper);
    assert.ok(scene.getObjectByName('child') === child);
    assert.deepEqual(events.slice(initial).sort(), ['start extra', 'start inside', 'stop a', 'stop extra', 'stop inside']);
});
