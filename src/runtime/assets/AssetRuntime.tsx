import type { AssetDependency } from '../../core/dependencies.js';
import { preparePrefab, type PreparedPrefab, type PrefabPreparationOptions } from "../prefabs/preparePrefab.js";
import { getComponent } from "../../core/ComponentRegistry.js";
import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Object3D, Texture } from "three";
import { useAssetCache, useAsset } from "./assetCache.js";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "./assetLoaders.js";
import { AudioAssetsContext } from "../audio/AudioRuntime.js";
import { denormalizePrefab, type PrefabState } from "../../core/prefab.js";
import type { Prefab } from "../../core/types.js";

export interface AssetRuntime {
    /** Evict an unused asset from local and shared caches. Returns its source for host-owned disposal.
     * Unmount consumers and finish pending loads first; eviction does not dispose live Three objects. */
    clearAsset: (kind: AssetDependency['kind'] | 'prefab', path: string) => Object3D | Texture | AudioBuffer | PrefabState | null;
    loadDocument: (path: string) => Promise<PrefabState>;
    /** Return an isolated copy of the shared definition. */
    readPrefab: (path: string) => Promise<Prefab>;
    loadAsset: (dependency: AssetDependency) => Promise<Object3D | Texture | AudioBuffer>;
    preparePrefab: (path: string, options?: PrefabPreparationOptions) => Promise<PreparedPrefab>;
    getPrefab: (path: string) => PrefabState | null;
    loadModel: (path: string, source?: () => Promise<Object3D>) => Promise<void>;
    loadTexture: (path: string, source?: () => Promise<Texture>) => Promise<void>;
    loadSound: (path: string, source?: () => Promise<AudioBuffer>) => Promise<void>;
    registerModel: (path: string, model: Object3D) => void;
    registerTexture: (path: string, texture: Texture) => void;
    registerSound: (path: string, sound: AudioBuffer) => void;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
}

export interface AssetRuntimeProviderProps {
    children: ReactNode;
    runtimeRef?: React.MutableRefObject<AssetRuntime | null>;
}

export const AssetRuntimeContext = createContext<AssetRuntime | null>(null);

/** Per-asset subscriptions for editor replacements and audio/material observers. */
interface AssetStoreState {
    models: LoadedModels;
    textures: LoadedTextures;
    sounds: LoadedSounds;
    soundVersions: Record<string, number>;
}

type AssetStoreApi = StoreApi<AssetStoreState>;

function createAssetStore(): AssetStoreApi {
    return createStore<AssetStoreState>(() => ({ models: {}, textures: {}, sounds: {}, soundVersions: {} }));
}

const AssetStoreContext = createContext<AssetStoreApi | null>(null);

function useAssetStore(): AssetStoreApi {
    const store = useContext(AssetStoreContext);
    if (!store) throw new Error("Asset hooks must be used inside <PrefabRoot>");
    return store;
}

/** Editor replacements are local; URL assets share the preparation cache. */
export function useModelAsset(path?: string | null): Object3D | null {
    const model = useStore(useAssetStore(), s => path ? s.models[path] ?? null : null);
    const loaded = useAsset('model', model ? null : path);
    return model ?? loaded;
}

/** Render-time dependency: URL textures suspend, runtime replacements are immediately available. */
export function useTextureAsset(path?: string | null): Texture | null {
    const texture = useStore(useAssetStore(), s => path ? s.textures[path] ?? null : null);
    const loaded = useAsset('texture', texture ? null : path);
    return texture ?? loaded;
}

/** Reacts only when one of the requested sound buffers is replaced or loaded. */
export function useSoundAssetRevision(paths: string[]): string {
    const runtime = useAssetRuntime();
    const revision = useStore(useAssetStore(), state => (
        paths.map(path => state.soundVersions[path] ?? 0).join('|')
    ));
    useEffect(() => {
        paths.forEach(path => { void runtime.loadSound(path).catch(() => {}); });
    }, [paths, runtime]);
    return revision;
}

export function useAssetRuntime(): AssetRuntime {
    const ctx = useContext(AssetRuntimeContext);
    if (!ctx) throw new Error("useAssetRuntime must be used inside <PrefabRoot>");
    return ctx;
}

/**
 * Ensures one shared asset runtime for a viewer tree. Nested viewers reuse the
 * outermost model, texture, and sound stores.
 */
export function AssetRuntimeProvider({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const inherited = useContext(AssetRuntimeContext);
    useImperativeHandle(inherited ? runtimeRef : undefined, () => inherited!, [inherited]);

    if (inherited) return children;
    return <AssetRuntimeOwner runtimeRef={runtimeRef}>{children}</AssetRuntimeOwner>;
}

function AssetRuntimeOwner({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const { clear: clearCachedAsset, get: getAsset, load: loadCachedAsset } = useAssetCache();
    const audioAssets = useContext(AudioAssetsContext);
    const [assetStore] = useState(createAssetStore);
    const registerModel = useCallback((path: string, model: Object3D) => {
        if (assetStore.getState().models[path] !== model)
            assetStore.setState(s => ({ models: { ...s.models, [path]: model } }));
    }, [assetStore]);
    const registerTexture = useCallback((path: string, texture: Texture) => {
        if (assetStore.getState().textures[path] !== texture)
            assetStore.setState(s => ({ textures: { ...s.textures, [path]: texture } }));
    }, [assetStore]);
    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        if (assetStore.getState().sounds[path] === sound) return;
        audioAssets?.register(path, sound);
        assetStore.setState(s => ({
            sounds: { ...s.sounds, [path]: sound },
            soundVersions: { ...s.soundVersions, [path]: (s.soundVersions[path] ?? 0) + 1 },
        }));
    }, [assetStore, audioAssets]);
    const getModel = useCallback((path: string) => assetStore.getState().models[path] ?? getAsset('model', path), [assetStore, getAsset]);
    const getTexture = useCallback((path: string) => assetStore.getState().textures[path] ?? getAsset('texture', path), [assetStore, getAsset]);
    const getSound = useCallback((path: string) => assetStore.getState().sounds[path] ?? getAsset('sound', path), [assetStore, getAsset]);
    const clearAsset = useCallback((kind: AssetDependency['kind'] | 'prefab', path: string) => {
        const cached = clearCachedAsset(kind, path);
        if (kind === 'prefab') return cached;
        const field = { model: 'models', texture: 'textures', sound: 'sounds' }[kind] as 'models' | 'textures' | 'sounds';
        const values = { ...assetStore.getState()[field] };
        const value = values[path] ?? cached;
        delete values[path];
        assetStore.setState({ [field]: values });
        if (kind === 'sound' && value) audioAssets?.remove(path, value as AudioBuffer);
        return value;
    }, [assetStore, clearCachedAsset, audioAssets]);
    const loadModel = useCallback(async (path: string, source?: () => Promise<Object3D>) => {
        if (source) registerModel(path, await source());
        else await loadCachedAsset('model', path);
    }, [registerModel, loadCachedAsset]);
    const loadTexture = useCallback(async (path: string, source?: () => Promise<Texture>) => {
        if (source) registerTexture(path, await source());
        else if (!getTexture(path)) await loadCachedAsset('texture', path);
    }, [getTexture, registerTexture, loadCachedAsset]);
    const loadSound = useCallback(async (path: string, source?: () => Promise<AudioBuffer>) => {
        if (source) registerSound(path, await source());
        else {
            const sound = getSound(path) ?? await loadCachedAsset('sound', path);
            registerSound(path, getSound(path) ?? sound);
        }
    }, [getSound, registerSound, loadCachedAsset]);
    const loadAsset = useCallback(async ({ kind, path }: AssetDependency) => {
        if (kind === 'model') return getModel(path) ?? await loadCachedAsset('model', path);
        if (kind === 'texture') { await loadTexture(path); return getTexture(path)!; }
        await loadSound(path); return getSound(path)!;
    }, [getModel, getTexture, getSound, loadTexture, loadSound, loadCachedAsset]);
    const loadDocument = useCallback((path: string) => loadCachedAsset('prefab', path), [loadCachedAsset]);
    const readPrefab = useCallback(async (path: string) =>
        structuredClone(denormalizePrefab(await loadDocument(path))), [loadDocument]);
    const getPrefab = useCallback((path: string) => getAsset('prefab', path), [getAsset]);
    const prepare = useCallback((path: string, options?: PrefabPreparationOptions) => preparePrefab({
        getComponent, loadDocument, loadAsset,
    }, path, options), [loadDocument, loadAsset]);
    const runtime = useMemo<AssetRuntime>(() => ({
        clearAsset, loadModel, loadTexture, loadSound, loadDocument, readPrefab, loadAsset, preparePrefab: prepare, getPrefab,
        registerModel, registerTexture, registerSound, getModel, getTexture, getSound,
    }), [clearAsset, loadModel, loadTexture, loadSound, loadDocument, readPrefab, loadAsset, prepare, getPrefab,
        registerModel, registerTexture, registerSound, getModel, getTexture, getSound]);

    useImperativeHandle(runtimeRef, () => runtime, [runtime]);

    return (
        <AssetStoreContext.Provider value={assetStore}>
            <AssetRuntimeContext.Provider value={runtime}>
                {children}
            </AssetRuntimeContext.Provider>
        </AssetStoreContext.Provider>
    );
}
