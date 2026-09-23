import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrefabStore } from '../src/tools/prefabeditor/prefabStore.ts';
import { createPrefabHistory } from '../src/tools/prefabeditor/prefabHistory.ts';
import { createPrefabApi } from '../src/tools/prefabeditor/prefabApi.ts';
import { createPrefabRegistry } from '../src/tools/prefabeditor/SceneContext.tsx';

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
