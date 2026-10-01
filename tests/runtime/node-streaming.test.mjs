import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group } from 'three';
import { createNodeMountQueue, EditorNodeStreaming } from '../../src/runtime/prefabs/NodeStreaming.tsx';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';

extend({ Group });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('node admission yields between batches and cancels unmounted work', () => {
    const frames = new Map();
    let id = 0;
    const queue = createNodeMountQueue(run => { frames.set(++id, run); return id; }, id => frames.delete(id), 2);
    const mounted = [];
    const tick = () => { const [id, run] = frames.entries().next().value; frames.delete(id); run(); };
    queue.enqueue(() => mounted.push('a'));
    const remove = queue.enqueue(() => mounted.push('removed'));
    queue.enqueue(() => mounted.push('b'));
    const cancelLast = queue.enqueue(() => mounted.push('c'));
    remove();
    assert.deepEqual(mounted, []);
    assert.equal(frames.size, 1);
    tick();
    assert.deepEqual(mounted, ['a', 'b']);
    assert.equal(frames.size, 1);
    cancelLast();
    assert.equal(frames.size, 0);
    queue.enqueue(() => mounted.push('d'));
    tick();
    assert.deepEqual(mounted, ['a', 'b', 'd']);
});

test('a suspended node leaves siblings, controls, and its transform mounted', async t => {
    const previousWindow = globalThis.window;
    const previousRequest = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    const frames = new Map();
    let frameId = 0;
    globalThis.requestAnimationFrame = run => { frames.set(++frameId, run); return frameId; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas }, size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => {
        await act(async () => root.unmount());
        globalThis.window = previousWindow;
        globalThis.requestAnimationFrame = previousRequest;
        globalThis.cancelAnimationFrame = previousCancel;
    });
    let resolve, loaded = false;
    const pending = new Promise(done => { resolve = done; });
    registerComponent({ name: 'StreamingTest', properties: {}, View: ({ children }) => {
        if (!loaded) throw pending;
        return h('group', { name: 'loaded-content' }, children);
    } });
    let store;
    await act(async () => {
        store = root.render(h(EditorNodeStreaming, { enabled: true },
            h('group', { name: 'controls' }),
            h(PrefabRoot, { editMode: true, data: { root: { id: 'root', children: [
                { id: 'slow', name: 'slow-transform', components: { loader: { type: 'StreamingTest', properties: {} } } },
                { id: 'fast', name: 'fast-sibling' },
            ] } } })));
    });
    const scene = store.getState().scene;
    assert.ok(scene.getObjectByName('controls'), 'controls mount before construction starts');
    assert.equal(scene.getObjectByName('fast-sibling'), undefined);
    for (let i = 0; i < 2; i++) await act(async () => {
        const batch = [...frames.values()];
        frames.clear();
        batch.forEach(run => run(0));
    });
    const fast = scene.getObjectByName('fast-sibling');
    const slow = scene.getObjectByName('slow-transform');
    assert.ok(fast);
    assert.ok(slow);
    assert.ok(scene.getObjectByName('controls'));
    assert.equal(scene.getObjectByName('loaded-content'), undefined);
    await act(async () => { loaded = true; resolve(); await pending; });
    assert.ok(scene.getObjectByName('loaded-content'));
    assert.equal(scene.getObjectByName('fast-sibling'), fast);
    assert.equal(scene.getObjectByName('slow-transform'), slow);
});
