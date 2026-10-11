import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrefab, denormalizePrefab } from '../../src/core/prefab.ts';
import { resolveInlinePrefab } from '../../src/core/inlinePrefabs.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { createPrefabHistory } from '../../src/core/prefabHistory.ts';
import { createSceneAgent } from '../../src/editor/agent/sceneAgent.ts';
import { registerBuiltInComponents } from '../../src/runtime/components/index.ts';
registerBuiltInComponents();
const ref = (id, prefabId) => ({ id, components: { ref: { type: 'PrefabRef', properties: { prefabId } } } });
const fixture = () => ({ root: { id: 'world', children: [{ id: 'building', components: {
    transform: { type: 'Transform', properties: { position: [4, 0, 0] } },
}, children: [{ id: 'part', name: 'Concrete' }] }] } });
function editor(prefab = fixture()) {
    const store = createPrefabStore(prefab), history = createPrefabHistory(store); history.connect();
    const { scene } = createSceneAgent(store, () => ({ mode: () => 'edit', selectedId: () => null, canSave: () => false, beforeCommit() {},
        transaction: history.transaction, undo: history.undo, redo: history.redo, history: history.getSnapshot }));
    return { store, scene };
}

test('packing retains authored subtree and serializes only a packed marker', () => {
    const { scene, store } = editor();
    const part = store.getState().nodesById.part;
    const children = store.getState().childIdsById.building;
    scene.pack({ id: 'building' });
    assert.equal(store.getState().nodesById.part, part);
    assert.equal(store.getState().childIdsById.building, children);
    const saved = JSON.parse(scene.exportJSON());
    assert.equal(saved.prefabs, undefined);
    assert.deepEqual(saved.root.children[0], { ...fixture().root.children[0], packed: true });
    const definition = resolveInlinePrefab(store.getState(), 'building');
    assert.equal(definition.nodesById.building.components.transform, undefined);
    assert.equal(definition.nodesById.building.packed, undefined);
    assert.equal(definition, resolveInlinePrefab(store.getState(), 'building'));
    scene.undo(); assert.deepEqual(JSON.parse(scene.exportJSON()), fixture());
    scene.redo(); assert.deepEqual(JSON.parse(scene.exportJSON()), saved);
});

test('both duplicate paths create references and owner edits update the shared definition', () => {
    const { scene, store } = editor(); scene.pack({ id: 'building' });
    scene.duplicate({ id: 'building', newId: 'copy' });
    const other = store.getState().duplicateNode('building');
    for (const id of ['copy', other]) {
        assert.equal(store.getState().nodesById[id].components.prefabref.properties.prefabId, 'building');
        assert.equal(store.getState().childIdsById[id].length, 0);
        assert.equal(store.getState().nodesById[id].packed, undefined);
    }
    scene.batch({ expectedRevision: scene.info().revision, commands: [{ op: 'update', id: 'part', patch: { name: 'Updated concrete' } }] });
    assert.equal(resolveInlinePrefab(store.getState(), 'building').nodesById.part.name, 'Updated concrete');
    const saved = scene.export().prefab;
    assert.equal(saved.prefabs, undefined);
    assert.equal(resolveInlinePrefab(normalizePrefab(saved), 'building').nodesById.part.name, 'Updated concrete');
});

test('deleting the owner transfers its data to a surviving user and undo restores ownership', () => {
    const { scene, store } = editor(); scene.pack({ id: 'building' });
    scene.duplicate({ id: 'building', newId: 'copy' });
    scene.duplicate({ id: 'building', newId: 'copy-2' });
    const before = scene.exportJSON();
    scene.remove({ id: 'building' });
    const saved = JSON.parse(scene.exportJSON());
    assert.equal(saved.prefabs, undefined);
    const restored = normalizePrefab(saved);
    assert.ok(resolveInlinePrefab(restored, 'building'));
    assert.equal(saved.root.children[0].children[0].packed, true);
    assert.equal(store.getState().nodesById['copy-2'].components.prefabref.properties.prefabId, 'building');
    scene.undo(); assert.equal(scene.exportJSON(), before);
    scene.redo(); assert.deepEqual(JSON.parse(scene.exportJSON()), saved);
});

test('unpacking an owner retains the graph while remaining copies retain their definition', async () => {
    const { scene, store } = editor(); scene.pack({ id: 'building' });
    scene.duplicate({ id: 'building', newId: 'copy' });
    scene.duplicate({ id: 'building', newId: 'copy-2' });
    await scene.unpack({ id: 'building' });
    assert.equal(store.getState().nodesById.building.packed, false);
    assert.equal(store.getState().childIdsById.building[0], 'part');
    const reference = store.getState().nodesById['copy-2'].components.prefabref.properties.prefabId;
    assert.notEqual(reference, 'building');
    assert.ok(resolveInlinePrefab(normalizePrefab(scene.export().prefab), reference));
});

test('exporting only a reference carries its data inline and unpack keeps transforms', async () => {
    const { scene, store } = editor(); scene.pack({ id: 'building' }); scene.duplicate({ id: 'building', newId: 'copy' });
    const portable = scene.exportPrefab({ id: 'copy' }).prefab;
    assert.equal(portable.prefabs, undefined);
    assert.equal(portable.root.children[0].packed, true);
    assert.ok(normalizePrefab(portable).prefabs.building);
    await scene.unpack({ id: 'copy' });
    assert.equal(store.getState().nodesById.copy.components.prefabref, undefined);
    assert.deepEqual(store.getState().nodesById.copy.components.transform.properties.position, [4, 0, 0]);
    assert.equal(scene.get({ id: 'copy', depth: 3 }).descendants.length, 2);
});

test('nested packed definitions resolve and survive portable export', async () => {
    const { scene, store } = editor({ root: { id: 'world', children: [
        { id: 'part', packed: true, name: 'Shared part' },
        { id: 'building', children: [ref('use-part', 'part')] },
    ] } });
    scene.pack({ id: 'building' }); scene.duplicate({ id: 'building', newId: 'copy' });
    const exported = scene.exportPrefab({ id: 'copy' }).prefab;
    assert.equal(exported.prefabs, undefined);
    const normalized = normalizePrefab(exported);
    assert.ok(normalized.prefabs.part);
    await scene.unpack({ id: 'copy' });
    const saved = normalizePrefab(scene.export().prefab);
    for (const node of Object.values(saved.nodesById)) for (const component of Object.values(node.components ?? {})) {
        if (component.type === 'PrefabRef') assert.ok(resolveInlinePrefab(saved, component.properties.prefabId));
    }
    assert.equal(resolveInlinePrefab(store.getState(), 'building').nodesById['use-part'].components.ref.properties.prefabId, 'part');
});

test('packed validation is atomic and preparation reports missing definitions', () => {
    const { scene, store } = editor(); const before = scene.exportJSON();
    assert.throws(() => scene.batch({ expectedRevision: scene.info().revision, commands: [{ op: 'update', id: 'building', patch: { packed: 'yes' } }] }), /Invalid packed/);
    assert.equal(scene.exportJSON(), before);
    assert.throws(() => resolveInlinePrefab(store.getState(), 'missing'), /Unknown inline prefab/);
});

test('legacy table input saves as inline owners', () => {
    const state = normalizePrefab({ prefabs: { prop: { root: { id: 'data' } } }, root: { id: 'world', children: [ref('a', 'prop'), ref('b', 'prop')] } });
    const saved = denormalizePrefab(state);
    assert.equal(saved.prefabs, undefined);
    assert.equal(saved.root.children[0].children[0].id, 'prop');
    assert.ok(resolveInlinePrefab(normalizePrefab(saved), 'prop'));
});

test('portable copies remap nested packed owners and their references together', () => {
    const { scene } = editor({ root: { id: 'world', children: [{ id: 'building', packed: true, children: [
        { id: 'part', packed: true, children: [{ id: 'detail' }] }, ref('part-copy', 'part'),
    ] }, ref('copy', 'building')] } });
    const saved = scene.exportPrefab({ id: 'copy' }).prefab;
    const state = normalizePrefab(saved);
    const owner = saved.root.children[0];
    assert.equal(owner.children[0].packed, true);
    assert.equal(owner.children[1].components.ref.properties.prefabId, owner.children[0].id);
    assert.equal(Object.keys(state.prefabs).length, 2);
    assert.ok(resolveInlinePrefab(state, owner.children[0].id));
});

test('editing or moving the owner placement does not change its reusable shape', () => {
    const { scene, store } = editor(); scene.pack({ id: 'building' });
    const definition = store.getState().prefabs.building;
    scene.transform({ id: 'building', position: [20, 10, 5] });
    assert.equal(store.getState().prefabs.building, definition);
    scene.batch({ expectedRevision: scene.info().revision, commands: [{ op: 'move', id: 'part', parentId: 'world' }] });
    assert.equal(resolveInlinePrefab(store.getState(), 'building').nodesById.part, undefined);
});
