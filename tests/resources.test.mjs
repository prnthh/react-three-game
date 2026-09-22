import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceCache } from '../src/runtime/ResourceCache.ts';
import { preparePrefab } from '../src/runtime/preparePrefab.ts';
import { normalizePrefab } from '../src/tools/prefabeditor/prefab.ts';
import { createPrefabStore } from '../src/tools/prefabeditor/prefabStore.ts';

const flush = () => new Promise(resolve => queueMicrotask(resolve));

test('shared leases load once; release is idempotent and active assets cannot be evicted', async () => {
    let loads = 0;
    const disposed = [];
    const cache = new ResourceCache(value => disposed.push(value), 0);
    const load = async () => { loads++; return { name: 'shared' }; };
    const a = cache.acquire('a', load), b = cache.acquire('a', load);
    assert.equal(await a.ready, await b.ready);
    assert.equal(loads, 1);
    a.release(); a.release(); await flush();
    assert.equal(disposed.length, 0);
    b.release(); await flush();
    assert.equal(disposed.length, 1);
    cache.dispose();
    assert.equal(disposed.length, 1);
});

test('failed resources can retry; disposal cleans late completions exactly once', async () => {
    const disposed = [];
    const cache = new ResourceCache(value => disposed.push(value));
    const failed = cache.acquire('a', async () => { throw Error('offline'); });
    await assert.rejects(failed.ready, /offline/);
    failed.release();
    const retry = cache.acquire('a', async () => 'ok');
    assert.equal(await retry.ready, 'ok');
    let finish;
    const pending = cache.acquire('b', () => new Promise(resolve => { finish = resolve; }));
    await flush();
    cache.dispose(); finish('late');
    await assert.rejects(pending.ready, /disposed/);
    assert.deepEqual(disposed, ['ok', 'late']);
});

function fixture(spec, assetLoader = async () => ({})) {
    const released = [];
    const requested = [];
    const defs = {
        Ref: { name: 'Ref', properties: { path: { type: 'string', default: '' } }, dependencies: p => [{ kind: 'prefab', path: p.path }] },
        Image: { name: 'Image', properties: { path: { type: 'string', default: '/shared.png' } }, dependencies: p => [{ kind: 'texture', path: p.path }] },
    };
    return { released, requested, runtime: {
        getComponent: name => defs[name],
        acquireDocument(path) {
            requested.push(path);
            const values = spec[path];
            return { ready: Promise.resolve(normalizePrefab({ root: { id: path, components: Object.fromEntries(values.map((c, i) => [String(i), c])) } })), release: () => released.push(path) };
        },
        acquireAsset(dep) {
            requested.push(dep.path);
            return { ready: assetLoader(dep), release: () => released.push(dep.path) };
        },
    } };
}
const ref = path => ({ type: 'Ref', properties: { path } });
const image = () => ({ type: 'Image', properties: {} });

test('preparation discovers a shared DAG once, resolves defaults/basePath, retains through activation', async () => {
    const f = fixture({ '/game/root': [ref('/a'), ref('/b')], '/game/a': [ref('/c'), image()], '/game/b': [ref('/c'), image()], '/game/c': [] });
    const result = await preparePrefab(f.runtime, '/root', { basePath: '/game' });
    assert.equal(result.documentCount, 4);
    assert.equal(result.assetCount, 1);
    assert.equal(f.requested.filter(p => p === '/game/c').length, 1);
    assert.equal(f.requested.filter(p => p === '/game/shared.png').length, 1);
    assert.deepEqual(f.released, []);
    result.release(); result.release();
    assert.equal(f.released.length, 5);
});

test('cross-branch cycles fail instead of awaiting one another forever', async () => {
    const f = fixture({ '/root': [ref('/a'), ref('/b')], '/a': [ref('/b')], '/b': [ref('/a')] });
    await assert.rejects(preparePrefab(f.runtime, '/root'), /Cyclic prefab reference/);
    assert.equal(f.released.length, 3);
});

test('unknown components and failed assets fail preparation and release their leases', async () => {
    const f = fixture({ '/root': [{ type: 'Missing', properties: {} }] });
    await assert.rejects(preparePrefab(f.runtime, '/root'), /Missing.*root/);
    assert.equal(f.released.length, 1);
    const g = fixture({ '/root': [image()] }, async () => { throw Error('texture failed'); });
    await assert.rejects(preparePrefab(g.runtime, '/root'), /texture failed/);
    assert.equal(g.released.length, 2);
});

test('cancellation releases promptly without waiting for shared network work', async () => {
    let finish;
    const f = fixture({ '/root': [image()] }, () => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const work = preparePrefab(f.runtime, '/root', { signal: controller.signal });
    await flush(); await flush();
    controller.abort(new Error('cancelled'));
    await assert.rejects(work, /cancelled/);
    assert.equal(f.released.length, 2);
    finish({});
});

test('instances share immutable definitions but edits stay local', () => {
    const document = normalizePrefab({ root: { id: 'root', children: [{ id: 'child', name: 'original' }] } });
    const a = createPrefabStore(document), b = createPrefabStore(document);
    a.getState().updateNode('child', n => ({ ...n, name: 'changed' }));
    assert.equal(b.getState().nodesById.child.name, 'original');
    assert.equal(document.nodesById.child.name, 'original');
});

test('replacing a resource preserves old live instances until their leases release', async () => {
    const disposed = [];
    const cache = new ResourceCache(value => disposed.push(value), 0);
    const old = cache.acquire('texture', async () => 'old');
    await old.ready;
    cache.invalidate('texture');
    const current = cache.acquire('texture', async () => 'new');
    await current.ready;
    assert.deepEqual(disposed, []);
    old.release(); await flush();
    assert.deepEqual(disposed, ['old']);
    assert.equal(cache.get('texture'), 'new');
    current.release(); await flush();
    assert.deepEqual(disposed, ['old', 'new']);
});
