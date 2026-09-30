import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencies } from '../../tests/support/import-graph.mjs';

for (const entry of ['docs/app/components/DemoApp.tsx']) {
    test(`${entry} has no transitive authoring imports`, () => {
        const forbidden = dependencies(entry).filter(file => /(?:\.editor\.tsx?$|\/Input\.tsx$|\/EditorUI\.tsx$|\/PrefabEditor\.tsx$|\/assetviewer\/|\/editor\.ts$|\/ComponentEditors\.ts$|\/(?:sceneAgent|sceneAgentBridge|sceneAgentHelp|sceneAuthoringAdvice|sceneCommands|sceneCommandSchema|componentSchemas)\.ts$)/.test(file));
        assert.deepEqual(forbidden, []);
    });
}

