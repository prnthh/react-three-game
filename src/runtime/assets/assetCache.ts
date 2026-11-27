import { createContext, useContext } from 'react';
import { loadModel, loadSound, loadTexture } from './assetLoaders.js';
import { loadPrefabSource } from '../prefabs/prefabSource.js';

export const assetLoaders = {
    model: loadModel,
    texture: loadTexture,
    sound: loadSound,
    prefab: loadPrefabSource,
};
export type AssetLoaders = typeof assetLoaders;
type AssetKind = keyof AssetLoaders;
type AssetValue<K extends AssetKind> = Awaited<ReturnType<AssetLoaders[K]>>;

/** Scoped Suspense cache. Custom hosts do not replace the browser's shared loaders. */
export function createAssetCache(overrides: Partial<AssetLoaders> = {}) {
    let disposed = false;
    type Entry = { promise: Promise<AssetValue<AssetKind>>; value?: AssetValue<AssetKind>; error?: unknown };
    const entries = new Map<string, Entry>();
    function request(kind: AssetKind, path: string, key: string): Entry {
        if (disposed) throw new Error('Asset cache is disposed');
        const existing = entries.get(key);
        if (existing) return existing;
        const promise = (overrides[kind] ?? assetLoaders[kind])(path);
        const entry: Entry = { promise };
        entries.set(key, entry);
        promise.then(value => { entry.value = value; }, error => { entry.error = error; });
        return entry;
    }
    function get<K extends AssetKind>(kind: K, path: string) {
        return entries.get(`${kind}:${path}`)?.value as AssetValue<K> | undefined ?? null;
    }
    function clear<K extends AssetKind>(kind: K, path: string) {
        const value = get(kind, path);
        entries.delete(`${kind}:${path}`);
        return value;
    }
    function read<K extends AssetKind>(kind: K, path: string): AssetValue<K> {
        const entry = request(kind, path, `${kind}:${path}`);
        if ('error' in entry) throw entry.error;
        if ('value' in entry) return entry.value as AssetValue<K>;
        throw entry.promise;
    }
    async function load<K extends AssetKind>(kind: K, path: string): Promise<AssetValue<K>> {
        const key = `${kind}:${path}`;
        const entry = request(kind, path, key);
        try { return await entry.promise as AssetValue<K>; }
        catch (error) {
            if (entries.get(key) === entry) entries.delete(key);
            throw error;
        }
    }
    return { get, clear, read, load, dispose() { disposed = true; entries.clear(); } };
}

export const defaultAssetCache = createAssetCache();
export const AssetCacheContext = createContext(defaultAssetCache);
export const useAssetCache = () => useContext(AssetCacheContext);

export class ResourceLoadError extends Error {
    constructor(path: string, cause: unknown, readonly retry: () => void) {
        super(`Failed to load ${path}`, { cause });
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
