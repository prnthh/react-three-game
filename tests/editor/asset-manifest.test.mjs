import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssetManifest } from '../../src/runtime/assets/assetManifest.ts';

test('asset manifest uses the app base path and normalizes categories', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(url, '/game/manifest.json');
        return new Response(JSON.stringify({ models: ['/models/z.glb', '/models/a.glb', '/models/z.glb'] }));
    });
    assert.deepEqual(await loadAssetManifest('/game'), {
        models: ['/models/a.glb', '/models/z.glb'], textures: [], sound: [], prefabs: [],
    });
});

test('asset discovery distinguishes unavailable and malformed catalogs from empty catalogs', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
    await assert.rejects(loadAssetManifest(), /404/);
    fetch.mock.mockImplementation(async () => new Response(JSON.stringify({ textures: [42] })));
    await assert.rejects(loadAssetManifest(), /textures.*array of paths/);
    fetch.mock.mockImplementation(async () => new Response('[]'));
    await assert.rejects(loadAssetManifest(), /must be an object/);
});
