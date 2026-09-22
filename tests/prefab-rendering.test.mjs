import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNodeComponents } from '../src/tools/prefabeditor/nodePlan.ts';
import { registerComponent } from '../src/tools/prefabeditor/components/ComponentRegistry.ts';
import { createPrefabStore } from '../src/tools/prefabeditor/prefabStore.ts';

const View = () => null;
test('composition orders behaviors outside objects and attachments, resolving defaults', () => {
    for (const [name, slot] of [['TestMaterial', 'material'], ['TestObject', 'object'], ['TestBehavior', undefined]]) {
        registerComponent({ name, slot, properties: { amount: { default: 3 } }, View });
    }
    const node = { id: 'node', components: {
        material: { type: 'TestMaterial', properties: {} },
        object: { type: 'TestObject', properties: { amount: 5 } },
        behavior: { type: 'TestBehavior', properties: {} },
        transform: { type: 'Transform', properties: { position: [1, 2, 3] } },
    } };
    const plan = analyzeNodeComponents(node);
    assert.deepEqual(plan.composition.map(c => c.key), ['behavior', 'object', 'material']);
    assert.deepEqual(plan.composition.map(c => c.properties.amount), [3, 5, 3]);
    assert.deepEqual(plan.transform.position, [1, 2, 3]);
    assert.equal(analyzeNodeComponents(node), plan);
});

test('registering or replacing a view invalidates cached composition', () => {
    const node = { id: 'node', components: { late: { type: 'TestLate', properties: {} } } };
    assert.equal(analyzeNodeComponents(node).composition.length, 0);
    registerComponent({ name: 'TestLate', properties: {}, View });
    assert.equal(analyzeNodeComponents(node).composition[0].View, View);
    const Replacement = () => null;
    registerComponent({ name: 'TestLate', properties: {}, View: Replacement });
    assert.equal(analyzeNodeComponents(node).composition[0].View, Replacement);
});

const makeStore = () => createPrefabStore({ root: { id: 'root', children: [
    { id: 'a', children: [{ id: 'leaf' }] }, { id: 'b' },
] } });

test('property edits preserve unrelated references and reject hierarchy changes', () => {
    const store = makeStore();
    const before = store.getState();
    before.updateNode('a', node => ({ ...node, name: 'edited' }));
    const after = store.getState();
    assert.notEqual(after.nodesById.a, before.nodesById.a);
    assert.equal(after.nodesById.b, before.nodesById.b);
    assert.equal(after.childIdsById, before.childIdsById);
    assert.equal(after.parentIdById, before.parentIdById);
    assert.throws(() => after.updateNode('a', node => ({ ...node, id: 'renamed' })), /hierarchy actions/);
    assert.throws(() => after.updateNode('a', node => ({ ...node, children: [] })), /hierarchy actions/);
    assert.equal(store.getState(), after);
});

test('hierarchy actions keep parent and child indexes consistent', () => {
    const store = makeStore();
    const api = store.getState();
    api.moveNode('a', 'leaf', 'inside');
    assert.equal(store.getState(), api, 'cycles are ignored');
    api.moveNode('leaf', 'b', 'inside');
    assert.deepEqual(store.getState().childIdsById.a, []);
    assert.deepEqual(store.getState().childIdsById.b, ['leaf']);
    assert.equal(store.getState().parentIdById.leaf, 'b');
    const copy = api.duplicateNode('b');
    const copiedLeaf = store.getState().childIdsById[copy][0];
    assert.notEqual(copiedLeaf, 'leaf');
    assert.equal(store.getState().parentIdById[copiedLeaf], copy);
    api.deleteNode(copy);
    assert.equal(store.getState().nodesById[copiedLeaf], undefined);
    api.replaceNode('b', { id: 'replacement', children: [{ id: 'new-leaf' }] });
    assert.deepEqual(store.getState().childIdsById.root, ['a', 'replacement']);
    assert.equal(store.getState().nodesById.leaf, undefined);
    assert.equal(store.getState().parentIdById['new-leaf'], 'replacement');
    const before = store.getState();
    assert.throws(() => api.addChild('root', { id: 'a' }), /Duplicate/);
    assert.equal(store.getState(), before, 'failed insertion leaves the document unchanged');
    api.replaceNode('root', { id: 'new-root' });
    assert.equal(store.getState().rootId, 'new-root');
    assert.deepEqual(Object.keys(store.getState().nodesById), ['new-root']);
});
