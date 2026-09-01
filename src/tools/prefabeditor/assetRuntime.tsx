import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Object3D, Texture } from "three";
import { loadModel as fetchModel, loadSound as fetchSound, loadTexture as fetchTexture } from "../dragdrop";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { sound as soundManager } from "../../helpers/SoundManager";
import { normalizePrefab, type PrefabState } from "./prefab";
import type { Prefab } from "./types";

export interface AssetRuntime {
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

interface InternalAssetRuntime extends AssetRuntime {
    loadPrefab: (path: string) => Promise<PrefabState>;
    readModel: (path: string) => Object3D;
    trackLoad: <T>(promise: Promise<T>) => Promise<T>;
}

export interface AssetRuntimeProviderProps {
    children: ReactNode;
    runtimeRef?: React.MutableRefObject<AssetRuntime | null>;
}

/** Number of scene resources that are still loading. */
export function useScenePendingLoads(): number {
    return useStore(useAssetStore(), state => state.pendingLoads);
}

/** Register non-asset scene work, such as loading a nested prefab document. */
export function useTrackSceneLoad(): InternalAssetRuntime['trackLoad'] {
    const runtime = useContext(AssetRuntimeContext);
    if (!runtime) throw new Error("useTrackSceneLoad must be used inside <PrefabRoot>");
    return runtime.trackLoad;
}

/** Load and normalize one prefab definition per scene. */
export function useLoadPrefab(): InternalAssetRuntime['loadPrefab'] {
    const runtime = useContext(AssetRuntimeContext);
    if (!runtime) throw new Error("useLoadPrefab must be used inside <PrefabRoot>");
    return runtime.loadPrefab;
}

export const AssetRuntimeContext = createContext<InternalAssetRuntime | null>(null);

/**
 * Reactive backing store for loaded assets. Components subscribe to the single
 * asset slot they care about via the selector hooks below, so loading one asset
 * only re-renders the handful of nodes that reference it — not every consumer of
 * the runtime. `visualVersion` is the coarse signal used by systems that must
 * rebuild after model or texture availability changes.
 */
interface AssetStoreState {
    models: LoadedModels;
    textures: LoadedTextures;
    sounds: LoadedSounds;
    soundVersions: Record<string, number>;
    modelVersion: number;
    visualVersion: number;
    pendingLoads: number;
}

type AssetStoreApi = StoreApi<AssetStoreState>;

function createAssetStore(): AssetStoreApi {
    return createStore<AssetStoreState>(() => ({ models: {}, textures: {}, sounds: {}, soundVersions: {}, modelVersion: 0, visualVersion: 0, pendingLoads: 0 }));
}

const AssetStoreContext = createContext<AssetStoreApi | null>(null);

function useAssetStore(): AssetStoreApi {
    const store = useContext(AssetStoreContext);
    if (!store) throw new Error("Asset hooks must be used inside <PrefabRoot>");
    return store;
}

/** Subscribe to a single loaded model; re-renders only when that model changes. */
export function useModelAsset(path?: string | null): Object3D | null {
    const runtime = useAssetRuntime();
    const model = useStore(useAssetStore(), s => (path ? s.models[path] ?? null : null));
    useEffect(() => {
        if (path) void runtime.loadModel(path);
    }, [path, runtime]);
    return model;
}

/** Suspends the nearest node boundary until this model is available. */
export function useSuspenseModelAsset(path?: string | null): Object3D | null {
    const runtime = useContext(AssetRuntimeContext);
    if (!runtime) throw new Error("Asset hooks must be used inside <PrefabRoot>");
    const model = useStore(useAssetStore(), s => (path ? s.models[path] ?? null : null));
    return path && !model ? runtime.readModel(path) : model;
}

/** Subscribe to a single loaded texture; re-renders only when that texture changes. */
export function useTextureAsset(path?: string | null): Texture | null {
    const runtime = useAssetRuntime();
    const texture = useStore(useAssetStore(), s => (path ? s.textures[path] ?? null : null));
    useEffect(() => {
        if (path) void runtime.loadTexture(path);
    }, [path, runtime]);
    return texture;
}

/** Reacts only when one of the requested sound buffers is replaced or loaded. */
export function useSoundAssetRevision(paths: string[]): string {
    const runtime = useAssetRuntime();
    const revision = useStore(useAssetStore(), state => (
        paths.map(path => state.soundVersions[path] ?? 0).join('|')
    ));
    useEffect(() => {
        for (let index = 0; index < paths.length; index += 1) {
            void runtime.loadSound(paths[index]);
        }
    }, [paths, runtime]);
    return revision;
}

/** Coarse visual-only signal for systems that rebake when scene imagery changes. */
export function useVisualAssetRevision(): number {
    return useStore(useAssetStore(), s => s.visualVersion);
}

/** Coarse model-only signal for derived geometry that may gain new meshes. */
export function useModelAssetRevision(): number {
    return useStore(useAssetStore(), s => s.modelVersion);
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
    const [assetStore] = useState(createAssetStore);
    const [loads] = useState(() => new Map<string, Promise<void>>());
    const [prefabLoads] = useState(() => new Map<string, Promise<PrefabState>>());
    const [loadErrors] = useState(() => new Map<string, unknown>());
    const trackLoad = useCallback(<T,>(promise: Promise<T>) => {
        queueMicrotask(() => assetStore.setState(state => ({ pendingLoads: state.pendingLoads + 1 })));
        const settle = () => assetStore.setState(state => ({ pendingLoads: Math.max(0, state.pendingLoads - 1) }));
        return promise.then(value => {
            settle();
            return value;
        }, error => {
            settle();
            throw error;
        });
    }, [assetStore]);

    const registerModel = useCallback((path: string, model: Object3D) => {
        if (assetStore.getState().models[path] === model) return;
        loadErrors.delete(`model:${path}`);
        assetStore.setState(s => ({
            models: { ...s.models, [path]: model },
            modelVersion: s.modelVersion + 1,
            visualVersion: s.visualVersion + 1,
        }));
    }, [assetStore, loadErrors]);
    const registerTexture = useCallback((path: string, texture: Texture) => {
        if (assetStore.getState().textures[path] === texture) return;
        loadErrors.delete(`texture:${path}`);
        assetStore.setState(s => ({ textures: { ...s.textures, [path]: texture }, visualVersion: s.visualVersion + 1 }));
    }, [assetStore, loadErrors]);
    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        if (assetStore.getState().sounds[path] === sound) return;
        loadErrors.delete(`sound:${path}`);
        soundManager.setBuffer(path, sound);
        assetStore.setState(s => ({
            sounds: { ...s.sounds, [path]: sound },
            soundVersions: { ...s.soundVersions, [path]: (s.soundVersions[path] ?? 0) + 1 },
        }));
    }, [assetStore, loadErrors]);

    const getModel = useCallback((path: string) => assetStore.getState().models[path] ?? null, [assetStore]);
    const getTexture = useCallback((path: string) => assetStore.getState().textures[path] ?? null, [assetStore]);
    const getSound = useCallback((path: string) => assetStore.getState().sounds[path] ?? null, [assetStore]);
    const load = useCallback((
        type: 'model' | 'texture' | 'sound',
        path: string,
        source?: () => Promise<Object3D | Texture | AudioBuffer>,
    ) => {
        const state = assetStore.getState();
        if ((type === 'model' && state.models[path])
            || (type === 'texture' && state.textures[path])
            || (type === 'sound' && state.sounds[path])) return Promise.resolve();

        const key = `${type}:${path}`;
        const current = loads.get(key);
        if (current) return current;
        loadErrors.delete(key);

        const pending = trackLoad((source ? source() : (type === 'model' ? fetchModel(path)
            : type === 'texture' ? fetchTexture(path)
                : fetchSound(path)).then(result => {
                    if (!result.success) throw result.error;
                    if ('model' in result && result.model) return result.model;
                    if ('texture' in result && result.texture) return result.texture;
                    if ('sound' in result && result.sound) return result.sound;
                    throw new Error(`Asset loader returned no asset: ${path}`);
                }))
            .then(asset => {
                const latest = assetStore.getState();
                if (type === 'model' && !latest.models[path]) registerModel(path, asset as Object3D);
                else if (type === 'texture' && !latest.textures[path]) registerTexture(path, asset as Texture);
                else if (type === 'sound' && !latest.sounds[path]) registerSound(path, asset as AudioBuffer);
            })
            .catch(error => {
                const latest = assetStore.getState();
                const loaded = type === 'model' ? latest.models[path]
                    : type === 'texture' ? latest.textures[path]
                        : latest.sounds[path];
                if (loaded) return;
                loadErrors.set(key, error);
                console.warn(`Failed to load asset: ${path}`, error);
            }));
        loads.set(key, pending);
        void pending.then(() => loads.delete(key));
        return pending;
    }, [assetStore, loadErrors, loads, registerModel, registerSound, registerTexture, trackLoad]);
    const loadModel = useCallback((path: string, source?: () => Promise<Object3D>) => load('model', path, source), [load]);
    const loadTexture = useCallback((path: string, source?: () => Promise<Texture>) => load('texture', path, source), [load]);
    const loadSound = useCallback((path: string, source?: () => Promise<AudioBuffer>) => load('sound', path, source), [load]);
    const loadPrefab = useCallback((path: string) => {
        const current = prefabLoads.get(path);
        if (current) return current;
        const pending = trackLoad(fetch(path).then(response => {
            if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path}`);
            return response.json() as Promise<Prefab>;
        }).then(normalizePrefab));
        prefabLoads.set(path, pending);
        void pending.catch(() => prefabLoads.delete(path));
        return pending;
    }, [prefabLoads, trackLoad]);
    const readModel = useCallback((path: string) => {
        const model = assetStore.getState().models[path];
        if (model) return model;
        const error = loadErrors.get(`model:${path}`);
        if (error) throw error;
        throw loadModel(path);
    }, [assetStore, loadErrors, loadModel]);
    // Stable runtime: imperative readers do not re-render on asset loads.
    // Reactive consumers use the per-asset selector hooks.
    const runtime = useMemo<InternalAssetRuntime>(() => ({
        loadModel, loadTexture, loadSound, loadPrefab,
        registerModel, registerTexture, registerSound,
        getModel, getTexture, getSound, readModel, trackLoad,
    }), [loadModel, loadTexture, loadSound, loadPrefab, registerModel, registerTexture, registerSound, getModel, getTexture, getSound, readModel, trackLoad]);

    useImperativeHandle(runtimeRef, () => runtime, [runtime]);

    return (
        <AssetStoreContext.Provider value={assetStore}>
            <AssetRuntimeContext.Provider value={runtime}>
                {children}
            </AssetRuntimeContext.Provider>
        </AssetStoreContext.Provider>
    );
}
