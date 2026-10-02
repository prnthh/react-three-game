import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrefabPersistence, readSavedPrefab, SAVED_PREFAB_KEY } from '../app/editor/persistence.ts';

const prefab = { name: 'Shapes', root: { id: 'root', components: {}, children: [] } };
function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

test('API save and pending refresh flush restore complete documents, using one saved prefab', () => {
  const storage = memoryStorage();
  const writer = createPrefabPersistence(storage, () => {});
  writer.save(prefab);
  assert.deepEqual(readSavedPrefab(storage), prefab);
  const edited = { ...prefab, name: 'Autosaved shapes' };
  writer.schedule(() => edited);
  writer.flush();
  assert.deepEqual(readSavedPrefab(storage), edited);
  writer.dispose();
});

test('explicit save supersedes pending autosave and a new prefab replaces the saved document', () => {
  const storage = memoryStorage();
  const writer = createPrefabPersistence(storage, () => {});
  writer.schedule(() => prefab);
  writer.save({ ...prefab, name: 'Latest' });
  writer.flush();
  assert.equal(readSavedPrefab(storage).name, 'Latest');
  const template = { ...prefab, name: 'New Prefab' };
  writer.schedule(() => template);
  writer.dispose();
  assert.deepEqual(readSavedPrefab(storage), template);
});

test('storage failures reject API save, report autosave failure, and allow retry', () => {
  const storage = memoryStorage();
  const messages = [];
  let fails = true;
  const writer = createPrefabPersistence({ ...storage, setItem: (...args) => {
    if (fails) throw new Error('quota exceeded');
    storage.setItem(...args);
  } }, message => messages.push(message));
  assert.throws(() => writer.save(prefab), /quota/);
  writer.schedule(() => prefab);
  assert.doesNotThrow(() => writer.flush());
  assert.match(messages.at(-1), /Could not save/);
  fails = false;
  writer.flush();
  assert.deepEqual(readSavedPrefab(storage), prefab);
  writer.dispose();
});

test('invalid saved prefabs are reported rather than treated as empty scenes', () => {
  const storage = memoryStorage();
  storage.setItem(SAVED_PREFAB_KEY, '{');
  assert.throws(() => readSavedPrefab(storage));
  storage.setItem(SAVED_PREFAB_KEY, JSON.stringify({ version: 99, prefab }));
  assert.throws(() => readSavedPrefab(storage), /Invalid saved prefab/);
});
