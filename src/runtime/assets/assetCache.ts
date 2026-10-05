import { clear, peek, suspend } from 'suspend-react';
import { createContext, useContext } from 'react';
import { loadModel, loadSound, loadTexture } from './assetLoaders.js';
import { loadPrefabSource, decodeEmbeddedPrefabSource, describePrefabSource, isEmbeddedPrefabSource } from '../prefabs/prefabSource.js';

export const assetLoaders = {
    model: async (path: string) => {
        const result = await loadModel(path);
        if (!result.success || !result.model) throw result.error;
        return result.model;
    },
    texture: async (path: string) => {
        const result = await loadTexture(path);
        if (!result.success || !result.texture) throw result.error;
        return result.texture;
    },
    sound: async (path: string) => {
        const result = await loadSound(path);
        if (!result.success || !result.sound) throw result.error;
        return result.sound;
    },
    prefab: loadPrefabSource,
};
export type AssetLoaders = typeof assetLoaders;
type AssetKind = keyof AssetLoaders;
type AssetValue<K extends AssetKind> = Awaited<ReturnType<AssetLoaders[K]>>;

/** Scoped Suspense cache. Custom hosts do not replace the browser's shared loaders. */
export function createAssetCache(overrides: Partial<AssetLoaders> = {}) {
    let disposed = false;
    const keys = Object.fromEntries(Object.keys(assetLoaders).map(kind => [kind, {}])) as Record<AssetKind, object>;
    const paths = new Map<string, [object, string]>();
    const embeddedPrefabs = new Map<string, AssetValue<'prefab'>>();
    function key(kind: AssetKind, path: string): [object, string] {
        const value: [object, string] = [keys[kind], path];
        paths.set(`${kind}:${path}`, value);
        return value;
    }
    function get<K extends AssetKind>(kind: K, path: string): AssetValue<K> | null {
        if (kind === 'prefab' && embeddedPrefabs.has(path)) return embeddedPrefabs.get(path) as AssetValue<K>;
        return peek(key(kind, path)) as AssetValue<K> ?? null;
    }
    function evict<K extends AssetKind>(kind: K, path: string): AssetValue<K> | null {
        const value = get(kind, path);
        if (kind === 'prefab') embeddedPrefabs.delete(path);
        clear(key(kind, path));
        paths.delete(`${kind}:${path}`);
        return value;
    }
    function read<K extends AssetKind>(kind: K, path: string): AssetValue<K> {
        if (disposed) throw new Error('Asset cache is disposed');
        if (kind === 'prefab' && !overrides.prefab && isEmbeddedPrefabSource(path)) {
            let document = embeddedPrefabs.get(path);
            if (!document) {
                document = decodeEmbeddedPrefabSource(path);
                embeddedPrefabs.set(path, document);
            }
            return document as AssetValue<K>;
        }
        return suspend(() => (overrides[kind] ?? assetLoaders[kind])(path), key(kind, path)) as AssetValue<K>;
    }
    async function load<K extends AssetKind>(kind: K, path: string): Promise<AssetValue<K>> {
        for (;;) {
            try { return read(kind, path); }
            catch (pending) {
                if (!(pending instanceof Promise)) { evict(kind, path); throw pending; }
                await pending;
            }
        }
    }
    const clearAll = () => { paths.forEach(value => clear(value)); paths.clear(); embeddedPrefabs.clear(); };
    return { get, clear: evict, read, load, clearAll, dispose() { disposed = true; clearAll(); } };
}

export type AssetCache = ReturnType<typeof createAssetCache>;
export const defaultAssetCache = createAssetCache();
export const AssetCacheContext = createContext(defaultAssetCache);
export const useAssetCache = () => useContext(AssetCacheContext);
export const getAsset = defaultAssetCache.get;
export const clearAsset = defaultAssetCache.clear;
/** Await the same Suspense entry used by rendering. */
export const loadAsset = defaultAssetCache.load;

export class ResourceLoadError extends Error {
    constructor(path: string, cause: unknown, readonly retry: () => void) {
        super(`Failed to load ${describePrefabSource(path)}`, { cause });
        this.name = 'ResourceLoadError';
    }
}

export function useAsset<K extends AssetKind>(kind: K, path?: string | null): AssetValue<K> | null {
    const cache = useAssetCache();
    if (!path) return null;
    try { return cache.read(kind, path); }
    catch (error) {
        if (error instanceof Promise) throw error;
        throw new ResourceLoadError(path, error, () => { cache.clear(kind, path); });
    }
}
