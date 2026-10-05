import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot } from '@react-three/fiber';
import { Object3D, PerspectiveCamera } from 'three';
import { ComponentLifecycle } from '../../src/runtime/scene/ComponentLifecycle.tsx';
import CameraFollowComponent from '../../src/runtime/components/CameraFollowComponent.tsx';
import RuntimeComponent from '../../src/runtime/components/RuntimeComponent.tsx';
import { resolveComponentProperties } from '../../src/core/ComponentRegistry.ts';
import { PrefabContext, NodeComponentContext, NodeScope, createNodeComponentRegistry } from '../../src/runtime/scene/SceneContext.tsx';
import { GameEventsProvider, useGameEvents } from '../../src/runtime/scene/GameEvents.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(t, authored, component = RuntimeComponent, View = ComponentLifecycle) {
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
    const properties = resolveComponentProperties(component, authored);
    const render = async (options = {}, props = properties) => act(async () => {
        const view = h(PrefabContext.Provider, { value: prefab },
            h(NodeComponentContext.Provider, { value: registry },
                h(GameEventsProvider, null, h(Probe), h(NodeScope, { nodeId: 'test', ...options },
                    h(View, { component, properties: props, enabled: options.enabled ?? true })))));
        store = root.render(view);
    });
    const remove = () => act(async () => { root.render(null); });
    t.after(async () => {
        await remove();
        await act(async () => root.unmount());
    });
    return { object, prefab, calls, properties, render, remove, get events() { return events; }, get store() { return store; },
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


test('component lifecycle maps live R3F state, retains properties and runs before default frame consumers', async t => {
    let context;
    const observed = [];
    const component = {
        name: 'LifecycleProbe', properties: { speed: { default: 1 } },
        setup(ctx) { context = ctx; ctx.state.count = 0; },
        update(ctx) { ctx.state.count++; ctx.object.position.x += ctx.properties.speed * ctx.delta; },
    };
    const fixture = await mount(t, {}, component);
    await fixture.render();
    const camera = new PerspectiveCamera();
    fixture.store.getState().set({ camera });
    assert.equal(context.three, fixture.store.getState());
    assert.equal(context.three.camera, camera);
    const unsubscribe = fixture.store.getState().internal.subscribe({ current: () => observed.push(fixture.object.position.x) }, 0, fixture.store);
    t.after(unsubscribe);
    fixture.frame(0.5);
    await fixture.render({}, { speed: 3 });
    fixture.frame(0.5);
    assert.deepEqual(observed, [0.5, 2]);
    assert.equal(context.state.count, 2);
    assert.equal(context.delta, 0);
    await fixture.render({ enabled: false });
    fixture.frame();
    assert.equal(context.state.count, 2);
    await fixture.render();
    assert.equal(context.state.count, 0);
});

test('lifecycle failures release all resources once and stop updates', async t => {
    const errors = [];
    t.mock.method(console, 'error', (...args) => errors.push(args));
    for (const phase of ['setup', 'update']) {
        const cleanups = [];
        let updates = 0;
        const fixture = await mount(t, {}, {
            name: 'Failing', properties: {},
            setup(ctx) {
                ctx.onCleanup(() => cleanups.push('first'));
                ctx.onCleanup(() => { cleanups.push('second'); throw Error('cleanup'); });
                if (phase === 'setup') throw Error('setup');
                return () => cleanups.push('returned');
            },
            update() { updates++; throw Error('update'); },
        });
        await fixture.render();
        fixture.frame(); fixture.frame();
        await fixture.remove();
        assert.equal(updates, phase === 'setup' ? 0 : 1);
        assert.deepEqual(cleanups, phase === 'setup' ? ['second', 'first'] : ['returned', 'second', 'first']);
    }
    assert.equal(errors.length, 4);
});


test('CameraFollow uses R3F directly with play/preparation gating and live targets', async t => {
    const fixture = await mount(t, { targetId: 'target', followSpeed: 100, positionOffset: [0, 0, 5] }, CameraFollowComponent, CameraFollowComponent.View);
    const target = new Object3D();
    target.position.x = 10;
    fixture.prefab.getObject = id => id === 'test' ? fixture.object : id === 'target' ? target : null;
    await fixture.render({ preparing: true }); fixture.frame();
    assert.equal(fixture.object.position.x, 0);
    await fixture.render(); fixture.frame();
    assert.equal(fixture.object.position.x, 10);
    assert.equal(fixture.object.position.z, 5);
    await fixture.render({ enabled: false });
    target.position.x = 20;
    fixture.frame();
    assert.equal(fixture.object.position.x, 10);
    await fixture.render(); fixture.frame();
    assert.equal(fixture.object.position.x, 20);
    await fixture.render({}, { ...fixture.properties, targetId: 'missing' });
    target.position.x = 30;
    fixture.frame();
    assert.equal(fixture.object.position.x, 20);
});
