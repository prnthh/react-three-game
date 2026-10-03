import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dependencies } from '../support/import-graph.mjs';

for (const entry of ['src/index.ts', 'src/core.ts', 'src/viewer.ts']) {
    test(`${entry} has no transitive authoring imports`, () => {
        const forbidden = dependencies(entry).filter(file => /\/src\/editor(?:\/|\.ts$)/.test(file));
        assert.deepEqual(forbidden, []);
    });
}

for (const entry of ['src/core.ts', 'src/viewer.ts', 'src/editor.ts']) {
    test(`${entry} does not pull in optional plugins or host demos`, () => {
        assert.deepEqual(dependencies(entry).filter(file => /\/(?:plugins|docs)\//.test(file)), []);
    });
}

test('core remains independent of rendering runtime modules', () => {
    assert.deepEqual(dependencies('src/core.ts').filter(file => /\/runtime\/|\.tsx$/.test(file)), []);
});

// Check internal modules too: a clean barrel must not conceal an inverted dependency.
for (const file of readdirSync(new URL('../../src/core/', import.meta.url))) {
    if (!file.endsWith('.ts')) continue;
    test(`core/${file} has no runtime or editor dependency`, () => {
        assert.deepEqual(dependencies(`src/core/${file}`).filter(path => /\/src\/(runtime|editor|plugins)\//.test(path)), []);
    });
}

for (const entry of ['src/runtime/SceneRuntime.tsx', 'src/runtime/prefabs/PrefabRoot.tsx', 'src/headless.tsx', 'src/export.ts']) {
    test(`${entry} stays independent of browser hosts and editor IO`, () => {
        const forbidden = dependencies(entry).filter(file => /\/src\/(?:browser(?:\/|\.tsx?$)|editor(?:\/|\.ts$))/.test(file) || file.endsWith('/runtime/GameCanvas.tsx'));
        assert.deepEqual(forbidden, []);
    });
}
