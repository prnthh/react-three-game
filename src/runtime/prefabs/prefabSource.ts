import { normalizePrefab } from '../../core/prefab';
import type { Prefab } from '../../core/types';

/** Embedded references use the same URL loading contract as external references. */
export function isEmbeddedPrefabSource(url: string) {
    return /^data:(?:application|text)\/json(?:[;,])/i.test(url);
}

export function encodePrefabSource(prefab: Prefab) {
    return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(prefab))}`;
}

export function describePrefabSource(url: string) {
    return /^data:/i.test(url) ? 'embedded prefab' : url;
}

export async function loadPrefabSource(url: string, request: typeof fetch = fetch) {
    const label = describePrefabSource(url);
    const response = await request(url);
    if (!response.ok) throw new Error(`Prefab load failed (${response.status}) for ${label}`);
    try {
        const prefab = await response.json() as Prefab;
        if (!prefab || typeof prefab !== 'object' || !prefab.root || typeof prefab.root.id !== 'string') {
            throw new Error('Expected a prefab object with a root node ID.');
        }
        return normalizePrefab(prefab);
    } catch (error) {
        // Do not echo a potentially megabyte-sized inline source in an error message.
        throw new Error(`Invalid prefab document from ${label}`, { cause: error });
    }
}
