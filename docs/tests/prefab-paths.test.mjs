import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listPrefabPaths } from '../public/generate-prefab-manifest.mjs';
import { normalizePrefabName } from '../app/components/PrefabSelector.tsx';

const publicRoot = new URL('../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('prefabs/manifest.json', publicRoot)));

test('prefab picker preserves project folders and distinguishes identical filenames', () => {
    const paths = ['/prefabs/one/scene.json', '/prefabs/two/scene.json', '/prefabs/jumper-course.json'];
    assert.deepEqual(paths.map(normalizePrefabName), ['one/scene', 'two/scene', 'jumper-course']);
    for (const path of paths) assert.equal(`/prefabs/${normalizePrefabName(path)}.json`, path);
});

test('manifest includes nested prefabs and entry scenes but excludes dialogue documents', () => {
    assert.deepEqual(manifest, listPrefabPaths(fileURLToPath(new URL('prefabs/', publicRoot))));
    assert.ok(manifest.includes('/prefabs/detective-oni/scenes/office.json'));
    assert.ok(manifest.includes('/prefabs/detective-oni/characters/oni.json'));
    assert.ok(manifest.includes('/prefabs/detective-oni/detective-oni.json'));
    assert.ok(manifest.includes('/prefabs/the-cave/the-cave.json'));
    assert.ok(!manifest.includes('/prefabs/detective-oni/dialogue.json'));
});

test('every local prefab reference resolves after grouping projects', () => {
    function visit(value) {
        if (typeof value === 'string' && value.startsWith('/prefabs/')) {
            assert.ok(existsSync(new URL(value.slice(1), publicRoot)), `Missing ${value}`);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    }
    for (const path of manifest) visit(JSON.parse(readFileSync(new URL(path.slice(1), publicRoot))));
});
