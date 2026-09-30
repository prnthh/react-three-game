import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scenes = new Map(['stage', 'stage-outside'].map((file, index) => {
    const prefab = JSON.parse(readFileSync(new URL(`../public/prefabs/${file}.json`, import.meta.url)));
    const nodes = new Map();
    function visit(node) { assert.ok(!nodes.has(node.id)); nodes.set(node.id, node); node.children?.forEach(visit); }
    visit(prefab.root);
    return [index ? 'junkyard' : 'office', nodes];
}));

test('stage interaction references and scene transitions resolve', () => {
    for (const nodes of scenes.values()) {
        const components = node => Object.values(node.components ?? {});
        for (const node of nodes.values()) for (const component of components(node)) {
            if (component.type !== 'StageInteraction') continue;
            const p = component.properties;
            if (p.activationNodeId) assert.ok(nodes.has(p.activationNodeId));
            if (p.action === 'transition') {
                assert.ok(scenes.has(p.targetScene), `missing destination for ${node.id}`);
                assert.equal(p.spawn.length, 3);
            } else {
                assert.ok(p.pages.length > 0, `missing dialogue for ${node.id}`);
            }
        }
    }
});
