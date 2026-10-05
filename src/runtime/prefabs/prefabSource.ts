import { normalizePrefab, type PrefabState } from '../../core/prefab.js';
import type { Prefab } from '../../core/types.js';

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

function normalizeSource(prefab: Prefab): PrefabState {
    if (!prefab || typeof prefab !== 'object' || !prefab.root || typeof prefab.root.id !== 'string') {
        throw new Error('Expected a prefab object with a root node ID.');
    }
    return normalizePrefab(prefab);
}

/** Decode inline JSON during the cache read so it does not suspend an already authored scene. */
export function decodeEmbeddedPrefabSource(url: string): PrefabState {
    if (!isEmbeddedPrefabSource(url)) throw new Error('Expected an embedded prefab JSON URL.');
    try {
        const comma = url.indexOf(',');
        const payload = url.slice(comma + 1);
        const text = /;base64$/i.test(url.slice(0, comma))
            ? new TextDecoder().decode(Uint8Array.from(atob(payload), character => character.charCodeAt(0)))
            : decodeURIComponent(payload);
        return normalizeSource(JSON.parse(text) as Prefab);
    } catch (error) {
        throw new Error(`Invalid prefab document from ${describePrefabSource(url)}`, { cause: error });
    }
}

export async function loadPrefabSource(url: string, request: typeof fetch = fetch): Promise<PrefabState> {
    if (isEmbeddedPrefabSource(url)) return decodeEmbeddedPrefabSource(url);
    const label = describePrefabSource(url);
    const response = await request(url);
    if (!response.ok) throw new Error(`Prefab load failed (${response.status}) for ${label}`);
    try {
        return normalizeSource(await response.json() as Prefab);
    } catch (error) {
        throw new Error(`Invalid prefab document from ${label}`, { cause: error });
    }
}
