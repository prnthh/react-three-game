import { encodePrefabSource, isEmbeddedPrefabSource, loadPrefabSource } from '../../src/runtime/prefabs/prefabSource.ts';
import { withBasePath } from '../../src/runtime/assets/assetPaths.ts';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { assetLoaders, clearAsset, getAsset, loadAsset, defaultAssetCache, createAssetCache } from '../../src/runtime/assets/assetCache.ts';
import { preparePrefab } from '../../src/runtime/prefabs/preparePrefab.ts';

describe('Caching and ownership', () => {
    test('instances share immutable definitions but edits stay local', () => {
        const document = normalizePrefab({ root: { id: 'root', children: [{ id: 'child', name: 'original' }] } });
        const a = createPrefabStore(document), b = createPrefabStore(document);
        a.getState().updateNode('child', n => ({ ...n, name: 'changed' }));
        assert.equal(b.getState().nodesById.child.name, 'original');
        assert.equal(document.nodesById.child.name, 'original');
    });

    test('embedded definitions are ready on the first cache read and can be cleared', () => {
        const cache = createAssetCache();
        const path = encodePrefabSource({ root: { id: 'inline' } });
        const document = cache.read('prefab', path);
        assert.equal(document.rootId, 'inline');
        assert.equal(cache.get('prefab', path), document);
        assert.equal(cache.read('prefab', path), document);
        assert.equal(cache.clear('prefab', path), document);
        assert.equal(cache.get('prefab', path), null);
        assert.notEqual(cache.read('prefab', path), document);
        cache.dispose();
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
});

describe('Prefab preparation', () => {
    const flush = () => new Promise(resolve => queueMicrotask(resolve));

    function fixture(spec, assetLoader = async () => ({})) {
        const requested = [];
        const defs = {
            Ref: { name: 'Ref', properties: { path: { type: 'string', default: '' } }, dependencies: p => [{ kind: 'prefab', path: p.path }] },
            Image: { name: 'Image', properties: { path: { type: 'string', default: '/shared.png' } }, dependencies: p => [{ kind: 'texture', path: p.path }] },
        };
        return { requested, runtime: {
            getComponent: name => defs[name],
            loadDocument(path) {
                requested.push(path);
                const values = spec[path];
                return Promise.resolve(normalizePrefab({ root: { id: 'root', components: Object.fromEntries(values.map((c, i) => [String(i), c])) } }));
            },
            loadAsset(dep) {
                requested.push(dep.path);
                return assetLoader(dep);
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
        await work;
    });

    test('preparation discovers a shared DAG once and resolves defaults/basePath', async () => {
        const f = fixture({ '/game/root': [ref('/a'), ref('/b')], '/game/a': [ref('/c'), image()], '/game/b': [ref('/c'), image()], '/game/c': [] });
        const result = await preparePrefab(f.runtime, '/root', { basePath: '/game' });
        assert.equal(result.documentCount, 4);
        assert.equal(result.assetCount, 1);
        assert.equal(f.requested.filter(p => p === '/game/c').length, 1);
        assert.equal(f.requested.filter(p => p === '/game/shared.png').length, 1);
    });

    test('cross-branch cycles fail instead of awaiting one another forever', async () => {
        const f = fixture({ '/root': [ref('/a'), ref('/b')], '/a': [ref('/b')], '/b': [ref('/a')] });
        await assert.rejects(preparePrefab(f.runtime, '/root'), /Cyclic prefab reference/);
    });

    test('unknown components and failed assets fail preparation', async () => {
        const f = fixture({ '/root': [{ type: 'Missing', properties: {} }] });
        await assert.rejects(preparePrefab(f.runtime, '/root'), /Missing.*root/);
        const g = fixture({ '/root': [image()] }, async () => { throw Error('texture failed'); });
        await assert.rejects(preparePrefab(g.runtime, '/root'), /texture failed/);
    });

    test('cancellation rejects promptly without waiting for shared network work', async () => {
        let finish;
        const f = fixture({ '/root': [image()] }, () => new Promise(resolve => { finish = resolve; }));
        const controller = new AbortController();
        const work = preparePrefab(f.runtime, '/root', { signal: controller.signal });
        await flush(); await flush();
        controller.abort(new Error('cancelled'));
        await assert.rejects(work, /cancelled/);
        finish({});
    });
});

test('URL, percent-encoded and base64 prefabs normalize identically and reject bad documents', async () => {
    const prefab={name:'Étagère',root:{id:'asset',name:'木'}};
    const remote=await loadPrefabSource('/asset.json',async()=>new Response(JSON.stringify(prefab)));
    const embedded=await loadPrefabSource(encodePrefabSource(prefab), () => { throw Error('Embedded sources must decode locally'); });
    const base64=`data:application/json;base64,${Buffer.from(JSON.stringify(prefab)).toString('base64')}`;
    assert.deepEqual(remote,embedded);
    assert.deepEqual(await loadPrefabSource(base64),embedded);
    assert.equal(isEmbeddedPrefabSource(base64),true);
    assert.equal(isEmbeddedPrefabSource('data:text/json;charset=utf-8,{}'),true);
    assert.equal(isEmbeddedPrefabSource('/asset.json'),false);
    const uppercase=encodePrefabSource(prefab).replace('data:', 'DATA:');
    assert.equal(withBasePath('/game',uppercase),uppercase,'recognized inline sources must bypass the base path');
    assert.deepEqual(await loadPrefabSource(withBasePath('/game',uppercase)),embedded);
    assert.equal(withBasePath('/game','HTTPS://example.com/asset.json'),'HTTPS://example.com/asset.json');
    await assert.rejects(loadPrefabSource('/missing.json',async()=>new Response('',{status:404})),/404/);
    await assert.rejects(loadPrefabSource('data:application/json,not-json'),/Invalid prefab document from embedded prefab/);
    await assert.rejects(loadPrefabSource('/bad.json',async()=>new Response('{}')),/Invalid prefab/);
});

test('nested prefab references load JSON and render independent placements', async t => {
    const { createHeadlessScene } = await import('../../src/headless/index.tsx');
    const source = { root: { id: 'asset', name: 'Loaded asset', children: [{ id: 'child', name: 'Loaded child' }] } };
    const ref = id => ({ id, name: id, components: { ref: { type: 'PrefabRef', properties: { url: '/asset.json' } } } });
    let loads = 0;
    const host = await createHeadlessScene({ root: { id: 'world', children: [ref('a'), ref('b')] } }, {
        loaders: { prefab: async () => { loads++; return normalizePrefab(source); } },
    });
    t.after(() => host.dispose());
    const a = host.scene.getObjectByName('a').getObjectByName('Loaded asset');
    const b = host.scene.getObjectByName('b').getObjectByName('Loaded asset');
    assert.ok(a.getObjectByName('Loaded child'));
    assert.ok(b.getObjectByName('Loaded child'));
    assert.notEqual(a, b);
    a.position.x = 5;
    assert.equal(b.position.x, 0);
    assert.equal(loads, 1);
});

test('embedded prefab instances keep their shared definition across mode switches and sibling removal', async t => {
    const { act, createElement: h, StrictMode } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group } = await import('three');
    const { PrefabRoot, registerBuiltInComponents } = await import('../../src/viewer/index.ts');
    const { createAssetCache, AssetCacheContext } = await import('../../src/runtime/assets/assetCache.ts');
    registerBuiltInComponents();
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const source = { root: { id: 'asset', name: 'Embedded asset' } };
    const url = encodePrefabSource(source);
    let loads = 0;
    const cache = createAssetCache({ prefab: async () => { loads++; return normalizePrefab(source); } });
    const definition = await cache.load('prefab', url);
    const ref = id => ({ id, name: id, components: { ref: { type: 'PrefabRef', properties: { url } } } });
    const doc = createPrefabStore({ root: { id: 'world', children: [ref('a'), ref('b')] } });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); cache.dispose(); });
    let state;
    const render = async editMode => act(async () => {
        state = root.render(h(StrictMode, null, h(AssetCacheContext.Provider, { value: cache }, h(PrefabRoot, { store: doc, editMode }))));
    });
    await render(true);
    assert.equal(cache.get('prefab', url), definition, 'Strict Mode cleanup must not evict a mounted definition');
    const object = state.getState().scene.getObjectByName('b').getObjectByName('Embedded asset');
    await render(false);
    await render(true);
    assert.equal(loads, 1, 'mode changes must not reload visible prefabs');
    await act(async () => doc.getState().deleteNode('a'));
    assert.equal(cache.get('prefab', url), definition, 'removing one instance must preserve the other instance’s definition');
    await render(false);
    assert.equal(state.getState().scene.getObjectByName('b').getObjectByName('Embedded asset'), object);
    assert.equal(loads, 1);
});
