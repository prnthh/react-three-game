import { createPrefabDocumentApi } from '../../src/core/prefabDocumentApi.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGameEvents, GameEventsProvider, useGameEvents } from '../../src/runtime/scene/GameEvents.ts';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import { createPrefabApi } from '../../src/runtime/prefabs/prefabApi.ts';
import { createGameObjectHandle } from '../../src/runtime/scene/gameObject.ts';
import { createNodeComponentRegistry, createPrefabRegistry } from '../../src/runtime/scene/SceneContext.tsx';

async function renderFixture(t) {
    const { act } = await import('react');
    const { createRoot } = await import('@react-three/fiber');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    return { render: element => act(async () => { root.render(element); }), root, act };
}

test('nested document providers preserve their subtree when the outer store changes', async t => {
    const { useEffect } = await import('react');
    const { PrefabStoreProvider, usePrefabStoreApi } = await import('../../src/runtime/prefabs/PrefabStoreContext.ts');
    const { render } = await renderFixture(t);
    const inner = createPrefabStore({ root: { id: 'inner' } });
    const outer = createPrefabStore({ root: { id: 'outer' } });
    let mounts = 0, unmounts = 0;
    function Probe() {
        assert.equal(usePrefabStoreApi(), inner);
        useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
        return null;
    }
    const tree = store => createElement(PrefabStoreProvider, { store },
        createElement(PrefabStoreProvider, { store: inner }, createElement(Probe)));
    await render(tree(inner));
    await render(tree(outer));
    await render(tree(inner));
    assert.equal(mounts, 1);
    assert.equal(unmounts, 0);
});

test('event hooks keep one subscription, read committed props and release old event types', async t => {
    const { Suspense, startTransition } = await import('react');
    const { useGameEvent } = await import('../../src/runtime/scene/GameEvents.ts');
    const { render, root, act } = await renderFixture(t);
    const calls = [];
    const pending = new Promise(() => {});
    let bus, registrations = 0, cleanups = 0;
    function Capture() {
        const events = useGameEvents();
        if (!bus) {
            bus = events;
            const on = events.on;
            t.mock.method(events, 'on', (...args) => {
                registrations++;
                const off = on(...args);
                return () => { cleanups++; off(); };
            });
        }
        return null;
    }
    function Listener({ amount, type }) {
        useGameEvent(type, value => calls.push(amount + value));
        return null;
    }
    function Gate({ suspend }) { if (suspend) throw pending; return null; }
    const tree = (amount, type = 'hit', suspend = false) => createElement(GameEventsProvider, null,
        createElement(Capture), createElement(Suspense, { fallback: null },
            createElement(Listener, { amount, type }), createElement(Gate, { suspend })));
    await render(tree(1)); bus.emit('hit', 10);
    await render(tree(2)); bus.emit('hit', 10);
    assert.equal(registrations, 1, 'callback edits do not rebuild the subscription');
    await act(async () => { startTransition(() => root.render(tree(99, 'hit', true))); });
    bus.emit('hit', 10);
    assert.deepEqual(calls, [11, 12, 12], 'abandoned renders do not leak callback values');
    await render(tree(3, 'jump'));
    assert.equal(bus.hasListeners('hit'), false);
    bus.emit('jump', 10);
    assert.equal(calls.at(-1), 13);
    assert.equal(registrations, 2);
    assert.equal(cleanups, 1);
    await render(null);
    assert.equal(bus.hasListeners('jump'), false);
    assert.equal(cleanups, 2);
});

test('nested event providers reuse the outer bus; separate games are isolated', () => {
    const buses = [];
    function Probe() { buses.push(useGameEvents()); return null; }
    const nested = createElement(GameEventsProvider, null, createElement(Probe),
        createElement(GameEventsProvider, null, createElement(Probe)));
    renderToStaticMarkup(nested);
    renderToStaticMarkup(createElement(GameEventsProvider, null, createElement(Probe)));
    assert.equal(buses[0], buses[1]);
    assert.notEqual(buses[0], buses[2]);
    let count = 0;
    const off = buses[0].on('hit', () => count++);
    buses[2].emit('hit', {});
    assert.equal(count, 0);
    buses[1].emit('hit', {});
    assert.equal(count, 1);
    off();
});

test('repeated documents keep local edits and object lookups but use distinct event IDs', () => {
    const document = { root: { id: 'npc' } };
    const storeA = createPrefabStore(document), storeB = createPrefabStore(document);
    const a = createPrefabApi(storeA, createPrefabRegistry(), '');
    const b = createPrefabApi(storeB, createPrefabRegistry(), '');
    createPrefabDocumentApi(storeA).update('npc', node => ({ ...node, name: 'edited' }));
    assert.equal(createPrefabDocumentApi(storeB).get('npc').name, undefined);
    assert.equal(a.update, undefined, 'runtime access does not expose document mutations');
    a.registerObject('npc', { name: 'a object' });
    assert.equal(b.getObject('npc'), null);
    const components = createNodeComponentRegistry();
    const objectA = createGameObjectHandle('npc', 'a', a, components);
    const objectB = createGameObjectHandle('npc', 'b', b, components);
    const events = createGameEvents();
    let hits = 0;
    events.on('hit', ({ sourceNodeId }) => { if (sourceNodeId === objectB.id) hits++; });
    events.emit('hit', { sourceNodeId: objectA.id });
    assert.equal(hits, 0);
    events.emit('hit', { sourceNodeId: objectB.id });
    assert.equal(hits, 1);
});

test('asset loading shares URL resources, isolates replacements, and preserves replacements during pending loads', async t => {
    const { Group, Texture } = await import('three');
    const { AssetRuntimeProvider } = await import('../../src/runtime/assets/AssetRuntime.tsx');
    const { AssetCacheContext, createAssetCache } = await import('../../src/runtime/assets/assetCache.ts');
    const { AudioAssetsContext } = await import('../../src/runtime/audio/AudioRuntime.tsx');
    const { render, act } = await renderFixture(t);
    const model = new Group(), texture = new Texture(), sound = {};
    const loads = { model: 0, texture: 0, sound: 0 };
    let finishTexture;
    const pendingTexture = new Promise(resolve => { finishTexture = resolve; });
    let finishSound;
    const pendingSound = new Promise(resolve => { finishSound = resolve; });
    const failure = new Error('asset unavailable');
    const cache = createAssetCache({
        model: async path => { loads.model++; if (path === '/missing.glb') throw failure; return model; },
        texture: async path => { loads.texture++; return path === '/pending.png' ? pendingTexture : texture; },
        sound: async () => { loads.sound++; return pendingSound; },
    });
    t.after(() => { cache.dispose(); texture.dispose(); });
    const a = { current: null }, b = { current: null }, bridged = [];
    const audio = { register: (path, buffer) => bridged.push([path, buffer]), remove() {} };
    await render(createElement(AssetCacheContext.Provider, { value: cache },
        createElement(AudioAssetsContext.Provider, { value: audio },
            createElement(AssetRuntimeProvider, { runtimeRef: a }),
            createElement(AssetRuntimeProvider, { runtimeRef: b }))));
    for (const [kind, method, path, expected] of [
        ['model', 'loadModel', '/model.glb', model],
        ['texture', 'loadTexture', '/texture.png', texture],
    ]) {
        const values = await Promise.all([a.current[method](path), b.current[method](path)]);
        assert.deepEqual(values, [expected, expected]);
        assert.equal(loads[kind], 1, 'sibling runtimes share one URL load');
    }
    const replacement = new Group();
    await act(async () => { a.current.registerModel('/model.glb', replacement); });
    assert.equal(await a.current.loadModel('/model.glb'), replacement);
    assert.equal(await b.current.loadModel('/model.glb'), model);
    assert.equal(loads.model, 1);
    const replacementTexture = new Texture();
    t.after(() => replacementTexture.dispose());
    await act(async () => { a.current.registerTexture('/texture.png', replacementTexture); });
    assert.equal(await a.current.loadTexture('/texture.png'), replacementTexture);
    assert.equal(await b.current.loadTexture('/texture.png'), texture);
    assert.equal(loads.texture, 1);
    await act(async () => {
        const pending = a.current.loadTexture('/pending.png');
        a.current.registerTexture('/pending.png', replacementTexture);
        finishTexture(texture);
        assert.equal(await pending, replacementTexture, 'a texture replacement wins over the pending URL load');
    });
    await assert.rejects(a.current.loadModel('/missing.glb'), error => error === failure);

    let loaded;
    await act(async () => {
        loaded = a.current.loadSound('/sound.wav');
        a.current.registerSound('/sound.wav', sound);
        finishSound({ stale: true });
        assert.equal(await loaded, sound, 'an editor replacement wins over the pending URL load');
        assert.equal(await a.current.loadSound('/sound.wav'), sound);
    });
    assert.equal(loads.sound, 1);
    assert.deepEqual(bridged, [['/sound.wav', sound]], 'the audio bridge receives the replacement once');
});
