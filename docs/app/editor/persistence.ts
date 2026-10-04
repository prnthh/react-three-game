import type { Prefab } from 'react-three-game/core';

export const SAVED_PREFAB_KEY = 'react-three-game:editor:prefab:v1';

export function readSavedPrefab(storage: Pick<Storage, 'getItem'>): Prefab | null {
  const raw = storage.getItem(SAVED_PREFAB_KEY);
  if (raw === null) return null;
  const saved = JSON.parse(raw);
  if (saved?.version !== 1 || !isPrefab(saved.prefab)) {
    throw new Error('Invalid saved prefab.');
  }
  return saved.prefab;
}

function isPrefab(value: unknown): value is Prefab {
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!record(value) || !record(value.root)) return false;
  const ids = new Set<string>();
  const nodes: unknown[] = [value.root];
  while (nodes.length) {
    const node = nodes.pop();
    if (!record(node) || typeof node.id !== 'string' || !node.id || ids.has(node.id)) return false;
    ids.add(node.id);
    if (node.components !== undefined) {
      if (!record(node.components)) return false;
      for (const component of Object.values(node.components)) {
        if (!record(component) || typeof component.type !== 'string' || !record(component.properties)) return false;
      }
    }
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) return false;
      nodes.push(...node.children);
    }
  }
  return value.materials === undefined;
}

/** Host-owned persistence. Pending edits flush before navigation or explicit API saves. */
export function createPrefabPersistence(
  storage: Pick<Storage, 'setItem'>,
  report: (message: string) => void,
) {
  let pending: (() => Prefab) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  const save = (prefab: Prefab) => {
    try {
      storage.setItem(SAVED_PREFAB_KEY, JSON.stringify({ version: 1, prefab }));
      cancel();
    } catch (error) {
      report('Could not save in this browser. Export JSON to keep your work.');
      throw error;
    }
  };
  const flush = () => {
    if (pending) {
      try { save(pending()); } catch { /* Reported above; explicit save still rejects. */ }
    }
  };
  return {
    save,
    flush,
    schedule(read: () => Prefab) {
      pending = read;
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    },
    dispose() { flush(); cancel(); },
  };
}
