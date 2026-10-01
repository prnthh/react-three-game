import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceCache } from '../../src/runtime/assets/ResourceCache.ts';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createPrefabStore } from "../../src/core/prefabStore.ts";

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
