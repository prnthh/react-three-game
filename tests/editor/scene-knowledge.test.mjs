import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneToolGuide } from '../../src/editor/agent/sceneTools.ts';

test('guidance returned to a caller cannot mutate later discovery or tool guidance', () => {
    const guide = createSceneToolGuide(), original = structuredClone(guide);
    guide.concepts.node = 'changed'; guide.workflow[0].tools.length = 0;
    guide.tools.scene_info.description = 'changed'; guide.examples[0].arguments.includeGuide = true;
    assert.deepEqual(createSceneToolGuide(), original);
});
