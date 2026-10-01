import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, StrictMode } from 'react';
import { createRoot } from '@react-three/fiber';
import { Object3D } from 'three';
import RuntimeComponent from '../../src/runtime/components/RuntimeComponent.tsx';
import { resolveComponentProperties } from '../../src/core/ComponentRegistry.ts';
import { PrefabContext, NodeComponentContext, NodeScope, createNodeComponentRegistry } from '../../src/runtime/scene/SceneContext.tsx';
import { GameEventsProvider, useGameEvents } from '../../src/runtime/scene/GameEvents.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(t, authored, strict = false) {
    const object = new Object3D();
    const calls = [];
    const prefab = { getObject: () => object, record: value => calls.push(value) };
    const registry = createNodeComponentRegistry();
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({
        gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never',
    });
    let store, events, time = 0;
    function Probe() { events = useGameEvents(); return null; }
    const properties = resolveComponentProperties(RuntimeComponent, authored);
    const render = async (options = {}, props = properties) => act(async () => {
        const view = h(PrefabContext.Provider, { value: prefab },
            h(NodeComponentContext.Provider, { value: registry },
                h(GameEventsProvider, null, h(Probe), h(NodeScope, { nodeId: 'test', ...options },
                    h(RuntimeComponent.View, { properties: props, enabled: options.enabled ?? true })))));
        store = root.render(strict ? h(StrictMode, null, view) : view);
    });
    const remove = () => act(async () => { root.render(null); });
    t.after(async () => {
        await remove();
        await act(async () => root.unmount());
    });
    return { object, calls, properties, render, remove, get events() { return events; },
        frame: (delta = 1) => act(() => store.getState().advance(time += delta, false)) };
}



test('effect setup/cleanup follows activation and code edits; data edits keep current state', async t => {
    const fixture = await mount(t, {
        data: { speed: 1 },
        setup: 'state.count = 0; prefab.record("setup"); return () => prefab.record("cleanup");',
        update: 'state.count++; object.position.x += data.speed * delta; prefab.record(state.count);',
    });
    const { render, frame, calls, object, properties, remove } = fixture;
    await render({ editMode: true }); frame();
    await render({ preparing: true }); frame();
    await render({ enabled: false }); frame();
    assert.deepEqual(calls, []);
    await render();
    assert.deepEqual(calls, ['setup'], 'setup belongs to the effect, not the first frame');
    frame(0.5);
    await render({}, { ...properties, data: { speed: 3 } });
    frame(0.5);
    assert.deepEqual(calls, ['setup', 1, 2]);
    assert.equal(object.position.x, 2);
    await render({ enabled: false }); frame();
    assert.equal(calls.at(-1), 'cleanup');
    await render(); frame();
    assert.deepEqual(calls.slice(-2), ['setup', 1], 'reenabling creates fresh effect state');
    await render({}, { ...properties, update: 'prefab.record("changed update");' }); frame();
    assert.deepEqual(calls.slice(-3), ['cleanup', 'setup', 'changed update']);
    await render({}, { ...properties, setup: 'prefab.record("new setup"); return () => prefab.record("new cleanup");' });
    assert.deepEqual(calls.slice(-2), ['cleanup', 'new setup']);
    await render({ editMode: true }); frame();
    assert.equal(calls.at(-1), 'new cleanup');
    await render();
    await remove();
    assert.deepEqual(calls.slice(-2), ['setup', 'cleanup']);
});

test('setup subscriptions read live data and are cleaned up without another frame', async t => {
    const fixture = await mount(t, {
        data: { amount: 1 },
        setup: 'return events.on("jump", () => object.position.y += context.data.amount);',
    });
    await fixture.render();
    fixture.events.emit('jump');
    await fixture.render({}, { ...fixture.properties, data: { amount: 3 } });
    fixture.events.emit('jump');
    assert.equal(fixture.object.position.y, 4);
    await fixture.render({ enabled: false });
    assert.equal(fixture.events.hasListeners('jump'), false);
    await fixture.render();
    await fixture.remove();
    assert.equal(fixture.events.hasListeners('jump'), false);
});

test('script data and state are isolated between instances and authored JSON stays unchanged', async t => {
    const authored = { data: { nested: { count: 0 } },
        setup: 'data.nested.count++; state.count = 0;',
        update: 'state.count++; prefab.record([data.nested.count, state.count]);' };
    const a = await mount(t, authored);
    const b = await mount(t, authored);
    await a.render(); await b.render();
    a.frame(); a.frame(); b.frame();
    assert.deepEqual(a.calls, [[1, 1], [1, 2]]);
    assert.deepEqual(b.calls, [[1, 1]]);
    assert.equal(authored.data.nested.count, 0);
});

test('compilation and setup errors prevent updates; update errors report once and preserve cleanup', async t => {
    const errors = [];
    t.mock.method(console, 'error', (...args) => errors.push(args));
    const fixture = await mount(t, {
        setup: 'prefab.record("setup"); return () => prefab.record("cleanup");',
        update: 'if (',
    });
    await fixture.render(); fixture.frame();
    assert.deepEqual(fixture.calls, []);
    assert.match(errors[0][0], /node "test" \(update\)/);
    await fixture.render({}, { ...fixture.properties, setup: 'throw Error("setup failed");', update: 'prefab.record("unexpected");' });
    fixture.frame();
    assert.deepEqual(fixture.calls, []);
    assert.match(errors[1][0], /\(setup\)/);
    await fixture.render({}, { ...fixture.properties, update: 'throw Error("update failed");' });
    fixture.frame(); fixture.frame();
    assert.equal(errors.length, 3);
    await fixture.remove();
    assert.deepEqual(fixture.calls, ['setup', 'cleanup']);
    await fixture.render({}, { ...fixture.properties, setup: 'return () => { throw Error("cleanup failed"); };', update: '' });
    await fixture.remove();
    assert.match(errors.at(-1)[0], /\(cleanup\)/);
});

test('effect restarts under Strict Mode leave one subscription and release it on removal', async t => {
    const fixture = await mount(t, {
        setup: 'prefab.record("setup"); const off = events.on("ping", () => prefab.record("ping")); return () => { prefab.record("cleanup"); off(); };',
    }, true);
    await fixture.render();
    await fixture.render({ enabled: false });
    await fixture.render();
    const setups = fixture.calls.filter(value => value === 'setup').length;
    const cleanups = fixture.calls.filter(value => value === 'cleanup').length;
    assert.ok(setups >= 2, 'effect setup can repeat after cleanup');
    assert.equal(setups - cleanups, 1);
    fixture.events.emit('ping');
    assert.equal(fixture.calls.filter(value => value === 'ping').length, 1);
    await fixture.remove();
    assert.equal(fixture.events.hasListeners('ping'), false);
    assert.equal(fixture.calls.filter(value => value === 'cleanup').length, setups);
});
