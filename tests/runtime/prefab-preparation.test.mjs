import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePrefab } from '../../src/runtime/prefabs/preparePrefab.ts';
import { normalizePrefab } from '../../src/core/prefab.ts';

const flush = () => new Promise(resolve => queueMicrotask(resolve));

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
            return { ready: Promise.resolve(normalizePrefab({ root: { id: 'root', components: Object.fromEntries(values.map((c, i) => [String(i), c])) } })), release: () => released.push(path) };
        },
        acquireAsset(dep) {
            requested.push(dep.path);
            return { ready: assetLoader(dep), release: () => released.push(dep.path) };
        },
    } };
}
const ref = path => ({ type: 'Ref', properties: { path } });
const image = () => ({ type: 'Image', properties: {} });

test('preparation waits for assets from both the root and nested prefabs', async () => {
    const finish = new Map();
    let allRequested;
    const started = new Promise(resolve => { allRequested = resolve; });
    const f = fixture({
        '/root': [ref('/child'), image()],
        '/child': [{ type: 'Image', properties: { path: '/nested.png' } }],
    }, dependency => new Promise(resolve => {
        finish.set(dependency.path, resolve);
        if (finish.size === 2) allRequested();
    }));
    let ready = false;
    const work = preparePrefab(f.runtime, '/root').then(value => { ready = true; return value; });
    await started;
    assert.equal(ready, false);
    finish.get('/shared.png')({});
    await flush();
    assert.equal(ready, false, 'a loaded root asset does not make its nested dependency ready');
    finish.get('/nested.png')({});
    const prepared = await work;
    assert.deepEqual(f.released, [], 'prepared resources stay owned until explicitly released');
    prepared.release();
    assert.deepEqual(f.released.sort(), ['/child', '/nested.png', '/root', '/shared.png']);
});

test('preparation discovers a shared DAG once, resolves defaults/basePath, retains until released', async () => {
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

test('preparation errors describe embedded sources without dumping their payload', async () => {
    const source = 'data:application/json,' + 'private-payload'.repeat(1000);
    const f = fixture({ [source]: [{ type: 'Missing', properties: {} }] });
    await assert.rejects(preparePrefab(f.runtime, source), error => {
        assert.match(error.message, /Missing.*embedded prefab/);
        assert.ok(!error.message.includes(source), 'error must not include the embedded payload');
        return true;
    });
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
