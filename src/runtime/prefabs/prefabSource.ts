import { normalizePrefab, type PrefabState } from '../../core/prefab.js';
import type { Prefab } from '../../core/types.js';

function normalizeSource(prefab: Prefab): PrefabState {
    if (!prefab || typeof prefab !== 'object' || !prefab.root || typeof prefab.root.id !== 'string') {
        throw new Error('Expected a prefab object with a root node ID.');
    }
    return normalizePrefab(prefab);
}

/** All URL documents use the same loader and cache lifecycle. */
export async function loadPrefabSource(url: string, request: typeof fetch = fetch): Promise<PrefabState> {
    const response = await request(url);
    if (!response.ok) throw new Error(`Prefab load failed (${response.status}) for ${url}`);
    try { return normalizeSource(await response.json() as Prefab); }
    catch (error) { throw new Error(`Invalid prefab document from ${url}`, { cause: error }); }
}
