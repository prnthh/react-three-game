import { loadPrefabSource } from '../../src/runtime/prefabs/prefabSource.ts';
import { withBasePath } from '../../src/runtime/assets/assetPaths.ts';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { assetLoaders, defaultAssetCache, createAssetCache } from '../../src/runtime/assets/assetCache.ts';
import { preparePrefab } from '../../src/runtime/prefabs/preparePrefab.ts';
import { loadModel, loadTexture, loadSound, parseModelFromFile, parseTextureFromFile, parseSoundFromFile } from '../../src/runtime/assets/assetLoaders.ts';
import { Group, Texture, TextureLoader, SRGBColorSpace } from 'three';
import { loadFiles } from '../../src/editor/assets/DragDropLoader.tsx';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

test('sound file imports preserve bytes and read/decode failures', async t => {
    const input = new Uint8Array([1, 2, 3]).buffer, sound = {}, error = new Error('read failed');
    let fail = false;
    const previousWindow = globalThis.window;
    globalThis.window = { AudioContext: class { async decodeAudioData(bytes) {
        assert.notEqual(bytes, input);
        assert.deepEqual([...new Uint8Array(bytes)], [1, 2, 3]);
        if (fail) throw error;
        return sound;
    } } };
    t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
    const file = { arrayBuffer: async () => input };
    assert.equal(await parseSoundFromFile(file), sound);
    const fetchSound = t.mock.method(globalThis, 'fetch', async () => ({ arrayBuffer: async () => input }));
    assert.equal(await loadSound('/sound.wav'), sound);
    fail = true;
    await assert.rejects(parseSoundFromFile(file), value => value === error);
    await assert.rejects(loadSound('/sound.wav'), value => value === error);
    fetchSound.mock.mockImplementation(async () => { throw error; });
    await assert.rejects(loadSound('/sound.wav'), value => value === error);
    await assert.rejects(loadSound('/sound.unsupported'), /Unsupported file format/);
    await assert.rejects(parseSoundFromFile({ arrayBuffer: async () => { throw error; } }), value => value === error);
});

test('model loaders preserve progress, animation identity and original errors', async t => {
    for (const [extension, Loader] of [['glb', GLTFLoader], ['fbx', FBXLoader]]) {
        const model = new Group(), animations = [], error = new Error('decode failed'), progress = [];
        let fail = false;
        const path = `/model.${extension}?version=1`;
        const mocked = t.mock.method(Loader.prototype, 'load', (url, onLoad, onProgress, onError) => {
            assert.equal(url, path);
            onProgress({ loaded: 4, total: 0 });
            onProgress({ loaded: 8, total: 10 });
            if (fail) onError(error);
            else onLoad(extension === 'glb' ? { scene: model, animations } : model);
        });
        assert.equal(await loadModel(path, (...args) => progress.push(args)), model);
        assert.deepEqual(progress, [[path, 4, 4], [path, 8, 10]]);
        if (extension === 'glb') assert.equal(model.animations, animations);
        fail = true;
        await assert.rejects(loadModel(path), value => value === error);
        mocked.mock.mockImplementation(() => { throw error; });
        await assert.rejects(loadModel(path), value => value === error);
        mocked.mock.restore();
    }
    await assert.rejects(loadModel('/model.unsupported'), /Unsupported file format/);
});

describe('Caching and ownership', () => {
    test('instances share immutable definitions but edits stay local', () => {
        const document = normalizePrefab({ root: { id: 'root', children: [{ id: 'child', name: 'original' }] } });
        const a = createPrefabStore(document), b = createPrefabStore(document);
        a.getState().updateNode('child', n => ({ ...n, name: 'changed' }));
        assert.equal(b.getState().nodesById.child.name, 'original');
        assert.equal(document.nodesById.child.name, 'original');
    });

    test('URL definitions share one asynchronous cache and can be cleared', async () => {
        let loads = 0;
        const cache = createAssetCache({ prefab: async () => { loads++; return normalizePrefab({ root: { id: 'asset' } }); } });
        const path = '/asset.json';
        assert.throws(() => cache.read('prefab', path), error => error instanceof Promise);
        const document = await cache.load('prefab', path);
        assert.equal(cache.get('prefab', path), document);
        assert.equal(cache.read('prefab', path), document);
        assert.equal(loads, 1);
        assert.equal(cache.clear('prefab', path), document);
        assert.equal(cache.get('prefab', path), null);
        assert.notEqual(await cache.load('prefab', path), document);
        assert.equal(loads, 2);
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
            const prepared = defaultAssetCache.load('prefab', path);
            if (!renderFirst) read();
            assert.ok(renderPending instanceof Promise);
            const document = normalizePrefab({ root: { id: 'root' } });
            finish(document);
            assert.equal(await prepared, document);
            await renderPending;
            assert.equal(defaultAssetCache.read('prefab', path), document);
            assert.equal(defaultAssetCache.get('prefab', path), document);
            assert.equal(decode.mock.callCount(), 1);
            defaultAssetCache.clear('prefab', path);
            decode.mock.restore();
        }
    });
});

describe('Prefab preparation', () => {
    const flush = () => new Promise(resolve => queueMicrotask(resolve));

    test('loads each asset kind once with its explicit loader and resolved path', async () => {
        const requests = [];
        const runtime = {
            getComponent: () => ({ properties: {}, dependencies: () =>
                ['model', 'texture', 'sound', 'model'].map(kind => ({ kind, path: '/shared' })) }),
            loadDocument: async () => { throw Error('Unexpected document request'); },
            loadModel: async path => { requests.push(['model', path]); },
            loadTexture: async path => { requests.push(['texture', path]); },
            loadSound: async path => { requests.push(['sound', path]); },
        };
        const document = normalizePrefab({ root: { id: 'root', components: {
            assets: { type: 'Assets', properties: {} },
        } } });
        const prepared = await preparePrefab(runtime, document, { basePath: '/app' });
        assert.equal(prepared.assetCount, 3);
        assert.deepEqual(requests, [['model', '/app/shared'], ['texture', '/app/shared'], ['sound', '/app/shared']]);
    });

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
            ...Object.fromEntries(['model', 'texture', 'sound'].map(kind => [
                'load' + kind[0].toUpperCase() + kind.slice(1),
                path => { requested.push(path); return assetLoader({ kind, path }); },
            ])),
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

test('all prefab URLs use the supplied loader and reject bad documents', async () => {
    const prefab = { name: 'Étagère', root: { id: 'asset', name: '木' } };
    const calls = [];
    const request = async url => { calls.push(url); return new Response(JSON.stringify(prefab)); };
    const url = `data:application/json,${encodeURIComponent(JSON.stringify(prefab))}`;
    const remote = await loadPrefabSource('/asset.json', request);
    assert.deepEqual(await loadPrefabSource(url, request), remote);
    assert.deepEqual(calls, ['/asset.json', url], 'data URLs do not bypass the host loader');
    assert.deepEqual(await loadPrefabSource(url), remote, 'native fetch handles supported URL schemes');
    assert.equal(withBasePath('/game', 'HTTPS://example.com/asset.json'), 'HTTPS://example.com/asset.json');
    await assert.rejects(loadPrefabSource('/missing.json', async () => new Response('', { status: 404 })), /404/);
    await assert.rejects(loadPrefabSource('/bad.json', async () => new Response('{}')), /Invalid prefab/);
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

test('URL prefab instances keep their shared definition across mode switches and sibling removal', async t => {
    const { act, createElement: h, StrictMode } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group } = await import('three');
    const { PrefabRoot, registerBuiltInComponents } = await import('../../src/viewer/index.ts');
    const { createAssetCache, AssetCacheContext } = await import('../../src/runtime/assets/assetCache.ts');
    registerBuiltInComponents();
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const source = { root: { id: 'asset', name: 'Loaded asset' } };
    const url = '/asset.json';
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
    const object = state.getState().scene.getObjectByName('b').getObjectByName('Loaded asset');
    await render(false);
    await render(true);
    assert.equal(loads, 1, 'mode changes must not reload visible prefabs');
    await act(async () => doc.getState().deleteNode('a'));
    assert.equal(cache.get('prefab', url), definition, 'removing one instance must preserve the other instance’s definition');
    await render(false);
    assert.equal(state.getState().scene.getObjectByName('b').getObjectByName('Loaded asset'), object);
    assert.equal(loads, 1);
});

test('inline and external definitions prepare together, sharing dependencies and detecting cycles', async () => {
    const { default: PrefabRef } = await import('../../src/runtime/components/PrefabRefComponent.tsx');
    const ref = (id, properties) => ({ id, components: { ref: { type: 'PrefabRef', properties } } });
    const leaf = { root: { id: 'leaf', components: { image: { type: 'Image', properties: { path: '/stone.png' } } } } };
    const document = normalizePrefab({
        root: { id: 'root', children: [{ ...ref('building', { prefabId: 'leaf' }), packed: true }, { ...leaf.root, packed: true }, ref('a', { prefabId: 'building' }), ref('b', { prefabId: 'building' }), ref('c', { url: '/external.json' })] },
    });
    const requests = [];
    const runtime = {
        getComponent: name => name === 'PrefabRef' ? PrefabRef : { name, properties: { path: { type: 'string' } }, dependencies: p => [{ kind: 'texture', path: p.path }] },
        loadDocument: async path => { requests.push(path); return path.endsWith('/root.json') ? document : normalizePrefab(leaf); },
        loadModel: async () => { throw Error('Unexpected model'); },
        loadTexture: async path => { requests.push(path); },
        loadSound: async () => { throw Error('Unexpected sound'); },
    };
    const prepared = await preparePrefab(runtime, '/root.json', { basePath: '/app' });
    assert.equal(prepared.documentCount, 4);
    assert.equal(prepared.assetCount, 1);
    assert.deepEqual(requests.sort(), ['/app/external.json', '/app/root.json', '/app/stone.png']);
    const cycle = normalizePrefab({ root: { ...ref('loop', { prefabId: 'loop' }), packed: true } });
    await assert.rejects(preparePrefab({ ...runtime, loadDocument: async () => cycle }, '/cycle'), /Cyclic prefab/);
    const missing = normalizePrefab({ root: ref('root', { prefabId: 'missing' }) });
    await assert.rejects(preparePrefab({ ...runtime, loadDocument: async () => missing }, '/missing'), /Unknown inline prefab/);
});

test('inline instances update together, preserve placements, and survive original placement removal', async t => {
    const { act, createElement: h } = await import('react');
    const { createRoot, extend } = await import('@react-three/fiber');
    const { Group } = await import('three');
    const { PrefabRoot, registerBuiltInComponents } = await import('../../src/viewer/index.ts');
    const { createSceneAgent } = await import('../../src/editor/agent/sceneAgent.ts');
    registerBuiltInComponents(); extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const source = { root: { id: 'asset', name: 'Inline asset' } };
    const ref = (id, x) => ({ id, name: id, components: {
        transform: { type: 'Transform', properties: { position: [x, 0, 0] } },
        ref: { type: 'PrefabRef', properties: { prefabId: 'building' } },
    } });
    const doc = createPrefabStore({ root: { id: 'world', children: [{ id: 'building', packed: true, children: [source.root] }, ref('a', 1), ref('b', 5)] } });
    const cache = createAssetCache({ prefab: async () => { throw Error('Inline prefabs must not fetch'); } });
    const { AssetCacheContext } = await import('../../src/runtime/assets/assetCache.ts');
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); cache.dispose(); });
    let state;
    const render = async editMode => act(async () => { state = root.render(h(AssetCacheContext.Provider, { value: cache }, h(PrefabRoot, { store: doc, editMode }))); });
    await render(true);
    const a = state.getState().scene.getObjectByName('a');
    const b = state.getState().scene.getObjectByName('b');
    assert.notEqual(a.getObjectByName('Inline asset'), b.getObjectByName('Inline asset'));
    const agent = createSceneAgent(doc, () => ({ mode: () => 'edit', beforeCommit() {}, transaction: fn => fn() })).scene;
    await act(async () => agent.batch({ expectedRevision: agent.export().revision, commands: [
        { op: 'update', id: 'asset', patch: { name: 'Updated asset' } },
    ] }));
    assert.ok(a.getObjectByName('Updated asset'));
    const inner = b.getObjectByName('Updated asset');
    assert.ok(inner);
    assert.equal(b.position.x, 5);
    await render(false); await render(true);
    await act(async () => doc.getState().deleteNode('a'));
    assert.equal(b.getObjectByName('Updated asset'), inner);
    await act(async () => doc.getState().deleteNode('building'));
    assert.ok(b.getObjectByName('Updated asset'));
    assert.equal(b.position.x, 5);
    assert.equal(doc.getState().prefabs.building.root.children[0].name, 'Updated asset');
});

test('headless static export handles inline definitions and strips custom behavior inside them', async () => {
    const { exportPrefabToGLB } = await import('../../src/headless/index.tsx');
    const glb = await exportPrefabToGLB({ root: { id: 'world', children: [{ id: 'block', packed: true, components: {
        geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
        custom: { type: 'UnknownGameBehavior', properties: {} },
    } }, { id: 'a', components: { ref: { type: 'PrefabRef', properties: { prefabId: 'block' } } } }] } });
    assert.equal(new DataView(glb).getUint32(0, true), 0x46546c67);
});

test('preparation resolves packed owners and detects packed reference cycles', async () => {
    const ref = (id, prefabId) => ({ id, components: { ref: { type: 'PrefabRef', properties: { prefabId } } } });
    const document = normalizePrefab({ root: { id: 'world', children: [
        { id: 'building', packed: true, children: [{ id: 'part' }] }, ref('copy', 'building'),
    ] } });
    const runtime = {
        getComponent: name => name === 'PrefabRef' ? { properties: { prefabId: { type: 'string', default: '' } } } : undefined,
        loadDocument: async () => document,
        loadModel: async () => { throw Error('No external dependencies'); },
        loadTexture: async () => { throw Error('No external dependencies'); },
        loadSound: async () => { throw Error('No external dependencies'); },
    };
    const prepared = await preparePrefab(runtime, '/scene.json');
    assert.equal(prepared.documentCount, 2);
    const cycle = normalizePrefab({ root: { id: 'world', children: [
        { id: 'loop', packed: true, children: [ref('self', 'loop')] },
    ] } });
    await assert.rejects(preparePrefab({ ...runtime, loadDocument: async () => cycle }, '/cycle.json'), /Cyclic prefab reference/);
});

test('model file imports return the scene and preserve read/parse errors', async t => {
    const bytes = new ArrayBuffer(8), model = new Group(), animations = [], error = new Error('parse failed');
    const file = { name: 'scene.glb', arrayBuffer: async () => bytes };
    const parse = t.mock.method(GLTFLoader.prototype, 'parseAsync', async (input, path) => {
        assert.equal(input, bytes);
        assert.equal(path, '');
        return { scene: model, animations };
    });
    assert.equal(await parseModelFromFile(file), model);
    assert.equal(model.animations, animations);
    parse.mock.mockImplementation(async () => { throw error; });
    await assert.rejects(parseModelFromFile(file), value => value === error);
    await assert.rejects(parseModelFromFile({ ...file, arrayBuffer: async () => { throw error; } }), value => value === error);
    await assert.rejects(parseModelFromFile({ ...file, name: 'scene.unsupported' }), /Unsupported file format/);
});

test('texture loads preserve color space and release file URLs on success and failure', async t => {
    const texture = new Texture(), error = new Error('texture failed'), revoked = [];
    t.mock.method(URL, 'createObjectURL', () => 'blob:texture-test');
    t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
    const load = t.mock.method(TextureLoader.prototype, 'load', (_url, onLoad) => onLoad(texture));
    assert.equal(await loadTexture('/texture.png'), texture);
    assert.equal(texture.colorSpace, SRGBColorSpace);
    assert.equal(await parseTextureFromFile({}), texture);
    assert.deepEqual(revoked, ['blob:texture-test']);
    load.mock.mockImplementation((_url, _onLoad, _progress, onError) => onError(error));
    await assert.rejects(loadTexture('/texture.png'), value => value === error);
    await assert.rejects(parseTextureFromFile({}), value => value === error);
    load.mock.mockImplementation(() => { throw error; });
    await assert.rejects(parseTextureFromFile({}), value => value === error);
    assert.deepEqual(revoked, Array(3).fill('blob:texture-test'));
    await assert.rejects(loadTexture('/texture.unsupported'), /Unsupported file format/);
});

test('file drops report load failures once, including awaited start callbacks', async t => {
    const error = new Error('file failed');
    t.mock.method(URL, 'createObjectURL', () => 'blob:failed-texture');
    t.mock.method(URL, 'revokeObjectURL', () => {});
    t.mock.method(TextureLoader.prototype, 'load', (_url, _loaded, _progress, failed) => failed(error));
    for (const extension of ['glb', 'png', 'wav']) {
        for (const awaitStart of [false, true]) {
            const file = { name: `broken.${extension}`, arrayBuffer: async () => { throw error; } }, failures = [];
            await loadFiles([file], {
                ...(awaitStart ? { onModelLoadStart: load => load, onTextureLoadStart: load => load } : {}),
                onLoadError: (...args) => failures.push(args),
            });
            assert.deepEqual(failures, [[error, file.name, file]]);
        }
    }
});

test('file-drop completion awaits an asset even without a loaded callback', async t => {
    let finish;
    t.mock.method(GLTFLoader.prototype, 'parseAsync', () => new Promise(resolve => { finish = resolve; }));
    let completed = false;
    const file = { name: 'pending.glb', arrayBuffer: async () => new ArrayBuffer(0) };
    const pending = loadFiles([file], { onFilesLoaded: () => { completed = true; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    finish({ scene: new Group(), animations: [] });
    await pending;
    assert.equal(completed, true);
});
