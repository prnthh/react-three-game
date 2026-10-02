import { clear, peek, suspend } from 'suspend-react';
import { loadModel, loadSound, loadTexture } from './assetLoaders';
import { loadPrefabSource, describePrefabSource } from '../prefabs/prefabSource';

// One cache for both render-time reads and awaited preparation. These functions only decode.
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
type AssetKind = keyof typeof assetLoaders;
type AssetValue<K extends AssetKind> = Awaited<ReturnType<(typeof assetLoaders)[K]>>;

export function getAsset<K extends AssetKind>(kind: K, path: string): AssetValue<K> | null {
    return peek([assetLoaders[kind], path]) as AssetValue<K> ?? null;
}

export function clearAsset<K extends AssetKind>(kind: K, path: string): AssetValue<K> | null {
    const value = getAsset(kind, path);
    clear([assetLoaders[kind], path]);
    return value;
}

function readAsset<K extends AssetKind>(kind: K, path: string): AssetValue<K> {
    return suspend(() => assetLoaders[kind](path), [assetLoaders[kind], path]) as AssetValue<K>;
}

/** Await the same Suspense entry used by rendering; no second cache or loading state. */
export async function loadAsset<K extends AssetKind>(kind: K, path: string): Promise<AssetValue<K>> {
    for (;;) {
        try { return readAsset(kind, path); }
        catch (pending) {
            if (!(pending instanceof Promise)) { clearAsset(kind, path); throw pending; }
            await pending;
        }
    }
}

export class ResourceLoadError extends Error {
    constructor(path: string, cause: unknown, readonly retry: () => void) {
        super(`Failed to load ${describePrefabSource(path)}`, { cause });
        this.name = 'ResourceLoadError';
    }
}

export function useAsset<K extends AssetKind>(kind: K, path?: string | null): AssetValue<K> | null {
    if (!path) return null;
    try { return readAsset(kind, path); }
    catch (error) {
        if (error instanceof Promise) throw error;
        throw new ResourceLoadError(path, error, () => { clearAsset(kind, path); });
    }
}
