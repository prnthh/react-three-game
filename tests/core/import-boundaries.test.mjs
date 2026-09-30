import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencies } from '../support/import-graph.mjs';

for (const entry of ['src/index.ts', 'src/core.ts', 'src/viewer.ts']) {
    test(`${entry} has no transitive authoring imports`, () => {
        const forbidden = dependencies(entry).filter(file => /(?:\.editor\.tsx?$|\/Input\.tsx$|\/EditorUI\.tsx$|\/PrefabEditor\.tsx$|\/assetviewer\/|\/editor\.ts$|\/ComponentEditors\.ts$|\/(?:sceneAgent|sceneAgentBridge|sceneAgentHelp|sceneAuthoringAdvice|sceneCommands|sceneCommandSchema|componentSchemas)\.ts$)/.test(file));
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
