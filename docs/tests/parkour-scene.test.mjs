import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { walkPrefabWorldTransforms } from '../../src/core/transforms.ts';
import { extractPrefab } from '../../src/editor/prefabPacking.ts';

const course = () => JSON.parse(readFileSync(new URL('../public/prefabs/parkour-course.json', import.meta.url)));
function checkMaterials(state) {
    for (const node of Object.values(state.nodesById)) for (const component of Object.values(node.components ?? {})) {
        if (component.type === 'Material') assert.ok(state.materials[component.properties.name], `Missing material: ${component.properties.name}`);
    }
}

test('saved parkour assemblies resolve locally and use ordinary named material definitions', () => {
    const document = course(), state = normalizePrefab(document);
    const owners = Object.values(state.nodesById).filter(node => node.packed);
    assert.ok(owners.length > 0);
    checkMaterials(state);
    for (const node of Object.values(state.nodesById)) for (const component of Object.values(node.components ?? {})) {
        if (component.type === 'PrefabRef') {
            assert.ok(state.prefabs[component.properties.prefabId]);
            assert.equal(component.properties.url, undefined);
        }
    }
    // This compiler rejects URL references, cycles and missing packed owners.
    let colliders = 0;
    walkPrefabWorldTransforms(document, node => {
        if (Object.values(node.components ?? {}).some(component => component.type === 'CollisionSurface')) colliders++;
    });
    assert.ok(colliders > 0);
    for (const owner of owners) {
        const portable = extractPrefab(state, owner.id);
        checkMaterials(normalizePrefab(portable));
        walkPrefabWorldTransforms(portable, () => {});
    }
});
