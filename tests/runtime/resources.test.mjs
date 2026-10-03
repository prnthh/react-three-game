import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createPrefabStore } from "../../src/core/prefabStore";
import { assetLoaders, clearAsset, getAsset, loadAsset, defaultAssetCache } from '../../src/runtime/assets/assetCache.ts';


test('instances share immutable definitions but edits stay local', () => {
    const document = normalizePrefab({ root: { id: 'root', children: [{ id: 'child', name: 'original' }] } });
    const a = createPrefabStore(document), b = createPrefabStore(document);
    a.getState().updateNode('child', n => ({ ...n, name: 'changed' }));
    assert.equal(b.getState().nodesById.child.name, 'original');
    assert.equal(document.nodesById.child.name, 'original');
});


test('clearing a decoded prefab cache reloads its source without mutating existing documents', async t => {
    let revision = 'first';
    const request = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ root: { id: 'root', name: revision } })));
    const first = await loadAsset('prefab', '/cache-lifetime.json');
    assert.equal(await loadAsset('prefab', '/cache-lifetime.json'), first);
    assert.equal(clearAsset('prefab', '/cache-lifetime.json'), first);
    assert.equal(getAsset('prefab', '/cache-lifetime.json'), null);
    revision = 'second';
    const next = await loadAsset('prefab', '/cache-lifetime.json');
    assert.equal(first.nodesById.root.name, 'first');
    assert.equal(next.nodesById.root.name, 'second');
    assert.equal(request.mock.callCount(), 2);
    clearAsset('prefab', '/cache-lifetime.json');
});

test('clearing an in-flight load prevents it from repopulating the decoded cache', async t => {
    let finish;
    const response = new Promise(resolve => { finish = resolve; });
    t.mock.method(globalThis, 'fetch', () => response);
    let pending;
    try { defaultAssetCache.read('prefab', '/cache-pending.json'); } catch (value) { pending = value; }
    assert.ok(pending instanceof Promise);
    clearAsset('prefab', '/cache-pending.json');
    finish(new Response(JSON.stringify({ root: { id: 'root' } })));
    await pending;
    assert.equal(getAsset('prefab', '/cache-pending.json'), null);
});


test('imperative preparation and Suspense reads share pending and decoded assets in either order', async t => {
    for (const renderFirst of [true, false]) {
        const path = `/shared-${renderFirst}.json`;
        let finish;
        const source = new Promise(resolve => { finish = resolve; });
        const decode = t.mock.method(assetLoaders, 'prefab', () => source);
        let renderPending;
        const read = () => { try { defaultAssetCache.read('prefab', path); } catch (pending) { renderPending = pending; } };
        if (renderFirst) read();
        const prepared = loadAsset('prefab', path);
        if (!renderFirst) read();
        assert.ok(renderPending instanceof Promise);
        const document = normalizePrefab({ root: { id: 'root' } });
        finish(document);
        assert.equal(await prepared, document);
        await renderPending;
        assert.equal(defaultAssetCache.read('prefab', path), document);
        assert.equal(getAsset('prefab', path), document);
        assert.equal(decode.mock.callCount(), 1);
        clearAsset('prefab', path);
        decode.mock.restore();
    }
});

test('failed imperative loads reject and can retry without poisoning the render cache', async t => {
    let attempts = 0;
    const document = normalizePrefab({ root: { id: 'root' } });
    t.mock.method(assetLoaders, 'prefab', async () => {
        if (++attempts === 1) throw new Error('offline');
        return document;
    });
    await assert.rejects(loadAsset('prefab', '/retry.json'), /offline/);
    assert.equal(await loadAsset('prefab', '/retry.json'), document);
    assert.equal(defaultAssetCache.read('prefab', '/retry.json'), document);
    assert.equal(attempts, 2);
    clearAsset('prefab', '/retry.json');
});

test('disposed host caches cannot restart pending loads or retain late results', async () => {
    const { createAssetCache } = await import('../../src/runtime/assets/assetCache.ts');
    let finish;
    let calls = 0;
    const cache = createAssetCache({ prefab: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    const pending = cache.load('prefab', '/pending.json');
    cache.dispose();
    finish(normalizePrefab({ root: { id: 'root' } }));
    await assert.rejects(pending, /disposed/);
    assert.equal(calls, 1);
    assert.equal(cache.get('prefab', '/pending.json'), null);
});

test('absent optional assets do not load or suspend inside React', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { useAsset } = await import('../../src/runtime/assets/assetCache.ts');
    function Probe({ path }) { assert.equal(useAsset('prefab', path), null); return null; }
    for (const path of [undefined, null, '']) renderToStaticMarkup(createElement(Probe, { path }));
});
