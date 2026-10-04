import { normalizePrefab, reconcilePrefabState } from '../../src/core/prefab.ts';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import { createPrefabHistory } from '../../src/core/prefabHistory.ts';
import { createPrefabApi } from '../../src/runtime/prefabs/prefabApi.ts';
import { createPrefabRegistry } from '../../src/runtime/scene/SceneContext.tsx';

const tick = () => new Promise(resolve => queueMicrotask(resolve));
const fixture = () => {
    const store = createPrefabStore({ root: { id: 'root' } });
    const history = createPrefabHistory(store);
    const disconnect = history.connect();
    const api = createPrefabApi(store, createPrefabRegistry(), () => null, '');
    return { store, history, disconnect, api };
};

test('API and direct store edits use the same undo history, including synchronous multi-action edits', async () => {
    const { store, history, disconnect, api } = fixture();
    api.add({ id: 'child' });
    store.getState().setMaterial('concrete', { color: '#888' });
    await tick();
    api.update('child', node => ({ ...node, name: 'renamed' }));
    history.undo(); // flush pending edits before undoing
    assert.equal(api.get('child').name, undefined);
    history.undo();
    assert.equal(api.get('child'), null);
    assert.equal(api.getMaterial('concrete'), null);
    assert.deepEqual(history.getSnapshot(), { canUndo: false, canRedo: true });
    history.redo();
    assert.ok(api.get('child'));
    assert.equal(api.getMaterial('concrete').color, '#888');
    await tick();
    assert.equal(history.getSnapshot().canRedo, true, 'undo/redo never record themselves');
    disconnect();
});

test('new edits discard redo; loading clears pending history; play edits are not recorded', async () => {
    const { history, disconnect, api } = fixture();
    api.add({ id: 'a' });
    await tick();
    api.add({ id: 'b' });
    await tick();
    history.undo();
    api.add({ id: 'c' });
    await tick();
    assert.equal(history.getSnapshot().canRedo, false);
    history.setEnabled(false);
    api.update('c', node => ({ ...node, name: 'runtime' }));
    await tick();
    history.undo();
    assert.equal(api.get('c'), null);
    api.replace({ root: { id: 'loaded' } });
    history.clear();
    await tick();
    assert.deepEqual(history.getSnapshot(), { canUndo: false, canRedo: false });
    disconnect();
});

test('a document batch publishes once, supports dependent edits, and preserves undo snapshots', () => {
    const { store, api, history, disconnect } = fixture();
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);
    api.batch(() => {
        api.add({ id: 'group' });
        api.batch(() => api.add({ id: 'child' }, 'group'));
        assert.ok(api.get('child'), 'reads see preceding edits');
        api.update('child', node => ({ ...node, name: 'updated' }));
        api.setMaterial('paint', { color: '#fff' });
        api.setMaterial('paint', { color: '#000' });
        assert.equal(notifications, 0);
    });
    assert.equal(notifications, 1);
    assert.equal(before.nodesById.child, undefined);
    assert.deepEqual(before.childIdsById.root, []);
    assert.equal(before.materials.paint, undefined);
    const committed = store.getState();
    api.batch(() => {
        api.move('child', 'root', 'inside');
        api.remove('group');
    });
    assert.deepEqual(committed.childIdsById.group, ['child']);
    assert.equal(committed.parentIdById.child, 'group');
    assert.ok(committed.nodesById.group);
    history.undo();
    assert.equal(api.get('group'), null);
    history.redo();
    assert.equal(api.get('child').name, 'updated');
    disconnect();
});

test('failed and empty document batches do not publish or modify committed state', () => {
    const { store, api, disconnect } = fixture();
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);
    assert.throws(() => api.batch(() => {
        api.add({ id: 'child' });
        api.setMaterial('paint', { color: '#fff' });
        throw new Error('abort');
    }), /abort/);
    api.batch(() => {});
    assert.equal(store.getState(), before);
    assert.equal(api.get('child'), null);
    assert.equal(api.getMaterial('paint'), null);
    assert.equal(notifications, 0);
    api.add({ id: 'next' });
    assert.equal(notifications, 1, 'subsequent individual edits still publish immediately');
    disconnect();
});

describe('Document edits', () => {

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
});

test('prefab reconciliation preserves unchanged selector identities and removes deleted records', () => {
    const before=normalizePrefab({root:{id:'root',children:[{id:'a',name:'A'},{id:'b',name:'B'}]}});
    const next=normalizePrefab({root:{id:'root',children:[{id:'a',name:'changed'},{id:'b',name:'B'}]}});
    const reconciled=reconcilePrefabState(before,next);
    assert.equal(reconciled.nodesById.b,before.nodesById.b);
    assert.equal(reconciled.nodesById.root,before.nodesById.root);
    assert.notEqual(reconciled.nodesById.a,before.nodesById.a);
    assert.equal(reconciled.childIdsById,before.childIdsById);
    assert.equal(reconciled.materials,before.materials);
    assert.equal(reconciled.parentIdById,before.parentIdById);
    const removed=reconcilePrefabState(reconciled,normalizePrefab({root:{id:'root',children:[{id:'b',name:'B'}]}}));
    assert.equal(removed.nodesById.a,undefined);
    assert.deepEqual(removed.childIdsById.root,['b']);
});
