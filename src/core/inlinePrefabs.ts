import { normalizePrefab, type PrefabState } from './prefab.js';
import type { Prefab } from './types.js';

const documents = new WeakMap<Record<string, Prefab>, Map<string, PrefabState>>();

/** Packed nodes share normalized definitions; each placement owns its runtime store. */
export function resolveInlinePrefab(state: Pick<PrefabState, 'prefabs'>, id: string): PrefabState {
    const definitions = state.prefabs;
    if (!definitions || !Object.hasOwn(definitions, id)) throw new Error(`Unknown inline prefab "${id}".`);
    let cache = documents.get(definitions);
    if (!cache) documents.set(definitions, cache = new Map());
    let document = cache.get(id);
    if (!document) {
        document = normalizePrefab({ ...definitions[id], prefabs: { ...definitions, ...definitions[id].prefabs } });
        cache.set(id, document);
    }
    return document;
}
