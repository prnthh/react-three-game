import { useShallow } from "zustand/react/shallow";
import { ResourceCache, type ResourceLease } from "../../runtime/ResourceCache";
import { preparePrefab, type AssetDependency, type PreparedPrefab, type PrefabPreparationOptions } from "../../runtime/preparePrefab";
import { getComponent } from "./components/ComponentRegistry";
import { Mesh, type Material } from "three";
import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Object3D, Texture } from "three";
import { loadModel as fetchModel, loadSound as fetchSound, loadTexture as fetchTexture } from "../dragdrop/modelLoader";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop/modelLoader";
import { sound as soundManager } from "../../helpers/SoundManager";
import { normalizePrefab, type PrefabState } from "./prefab";
import type { Prefab } from "./types";

export interface AssetRuntime {
    /** Retain assets while an instance uses them; release on unload. */
    acquireAsset: (dependency: AssetDependency) => ResourceLease<Object3D | Texture | AudioBuffer>;
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

/** CPU/download work only. GPU compilation and activation are separate phases. */
export function useSceneLoadStats() {
    return useStore(useAssetStore(), useShallow(({ pendingLoads, completedLoads, failedLoads, totalLoadTimeMs }) => ({ pendingLoads, completedLoads, failedLoads, totalLoadTimeMs })));
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
    completedLoads: number;
    failedLoads: number;
    totalLoadTimeMs: number;
}

type AssetStoreApi = StoreApi<AssetStoreState>;

function createAssetStore(): AssetStoreApi {
    return createStore<AssetStoreState>(() => ({ models: {}, textures: {}, sounds: {}, soundVersions: {}, modelVersion: 0, visualVersion: 0, pendingLoads: 0, completedLoads: 0, failedLoads: 0, totalLoadTimeMs: 0 }));
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
        if (!path) return;
        const lease = runtime.acquireAsset({ kind: 'model', path });
        void lease.ready.catch(() => {});
        return lease.release;
    }, [path, runtime]);
    return model;
}

/** Suspends the nearest node boundary until this model is available. */
export function useSuspenseModelAsset(path?: string | null): Object3D | null {
    const runtime = useContext(AssetRuntimeContext);
    if (!runtime) throw new Error("Asset hooks must be used inside <PrefabRoot>");
    const model = useStore(useAssetStore(), s => (path ? s.models[path] ?? null : null));
    useEffect(() => {
        if (!path) return;
        const lease = runtime.acquireAsset({ kind: 'model', path });
        void lease.ready.catch(() => {});
        return lease.release;
    }, [path, runtime]);
    return path && !model ? runtime.readModel(path) : model;
}

/** Subscribe to a single loaded texture; re-renders only when that texture changes. */
export function useTextureAsset(path?: string | null): Texture | null {
    const runtime = useAssetRuntime();
    const texture = useStore(useAssetStore(), s => (path ? s.textures[path] ?? null : null));
    useEffect(() => {
        if (!path) return;
        const lease = runtime.acquireAsset({ kind: 'texture', path });
        void lease.ready.catch(() => {});
        return lease.release;
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
        const leases = paths.map(path => runtime.acquireAsset({ kind: 'sound', path }));
        leases.forEach(lease => { void lease.ready.catch(() => {}); });
        return () => leases.forEach(lease => lease.release());
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
    const [assetCache] = useState(() => new ResourceCache<CachedAsset>((asset) => {
        if (!asset.owned) return;
        const slot = asset.type === 'model' ? 'models' : asset.type === 'texture' ? 'textures' : 'sounds';
        const state = assetStore.getState();
        if (state[slot][asset.path] === asset.value) {
            const remaining = { ...state[slot] };
            delete remaining[asset.path];
            assetStore.setState({ [slot]: remaining });
        }
        disposeAsset(asset);
    }));
    const [prefabCache] = useState(() => new ResourceCache<PrefabState>(() => {}));
    useEffect(() => {
        const lifetime = {};
        assetStoreLifetime.set(assetStore, lifetime);
        return () => { queueMicrotask(() => {
            if (assetStoreLifetime.get(assetStore) !== lifetime) return;
            assetCache.dispose();
            prefabCache.dispose();
        }); };
    }, [assetCache, assetStore, prefabCache]);
    const [loadErrors] = useState(() => new Map<string, unknown>());
    const trackLoad = useCallback(<T,>(promise: Promise<T>) => {
        const started = performance.now();
        queueMicrotask(() => assetStore.setState(state => ({ pendingLoads: state.pendingLoads + 1 })));
        const settle = (failed = false) => assetStore.setState(state => ({
            pendingLoads: Math.max(0, state.pendingLoads - 1),
            completedLoads: state.completedLoads + Number(!failed),
            failedLoads: state.failedLoads + Number(failed),
            totalLoadTimeMs: state.totalLoadTimeMs + performance.now() - started,
        }));
        return promise.then(value => {
            settle();
            return value;
        }, error => {
            settle(true);
            throw error;
        });
    }, [assetStore]);

    const registerModel = useCallback((path: string, model: Object3D, replace = true) => {
        if (assetStore.getState().models[path] === model) return;
        if (replace) assetCache.invalidate(`model:${path}`);
        loadErrors.delete(`model:${path}`);
        assetStore.setState(s => ({
            models: { ...s.models, [path]: model },
            modelVersion: s.modelVersion + 1,
            visualVersion: s.visualVersion + 1,
        }));
    }, [assetCache, assetStore, loadErrors]);
    const registerTexture = useCallback((path: string, texture: Texture, replace = true) => {
        if (assetStore.getState().textures[path] === texture) return;
        if (replace) assetCache.invalidate(`texture:${path}`);
        loadErrors.delete(`texture:${path}`);
        assetStore.setState(s => ({ textures: { ...s.textures, [path]: texture }, visualVersion: s.visualVersion + 1 }));
    }, [assetCache, assetStore, loadErrors]);
    const registerSound = useCallback((path: string, sound: AudioBuffer, replace = true) => {
        if (assetStore.getState().sounds[path] === sound) return;
        if (replace) assetCache.invalidate(`sound:${path}`);
        loadErrors.delete(`sound:${path}`);
        soundManager.setBuffer(path, sound);
        assetStore.setState(s => ({
            sounds: { ...s.sounds, [path]: sound },
            soundVersions: { ...s.soundVersions, [path]: (s.soundVersions[path] ?? 0) + 1 },
        }));
    }, [assetCache, assetStore, loadErrors]);

    const getModel = useCallback((path: string) => assetStore.getState().models[path] ?? null, [assetStore]);
    const getTexture = useCallback((path: string) => assetStore.getState().textures[path] ?? null, [assetStore]);
    const getSound = useCallback((path: string) => assetStore.getState().sounds[path] ?? null, [assetStore]);
    const acquire = useCallback((type: AssetDependency['kind'], path: string, source?: () => Promise<Object3D | Texture | AudioBuffer>) => {
        const key = `${type}:${path}`;
        return assetCache.acquire(key, async () => {
            const state = assetStore.getState();
            const existing = type === 'model' ? state.models[path] : type === 'texture' ? state.textures[path] : state.sounds[path];
            if (existing) return { type, path, value: existing, owned: false };
            loadErrors.delete(key);
            return trackLoad((async () => {
                try {
                    const result = source ? await source() : await (type === 'model' ? fetchModel(path) : type === 'texture' ? fetchTexture(path) : fetchSound(path));
                    let asset: Object3D | Texture | AudioBuffer;
                    if ('success' in result) {
                        if (!result.success) throw result.error;
                        const loaded = 'model' in result ? result.model : 'texture' in result ? result.texture : 'sound' in result ? result.sound : undefined;
                        if (!loaded) throw new Error(`Asset loader returned no asset: ${path}`);
                        asset = loaded;
                    } else asset = result;
                    const latest = assetStore.getState();
                    const replacement = type === 'model' ? latest.models[path] : type === 'texture' ? latest.textures[path] : latest.sounds[path];
                    if (replacement) {
                        if (replacement !== asset) disposeAsset({ type, path, value: asset, owned: true });
                        return { type, path, value: replacement, owned: false };
                    }
                    if (type === 'model') registerModel(path, asset as Object3D, false);
                    else if (type === 'texture') registerTexture(path, asset as Texture, false);
                    else registerSound(path, asset as AudioBuffer, false);
                    return { type, path, value: asset, owned: true };
                } catch (error) {
                    loadErrors.set(key, error);
                    throw error;
                }
            })());
        });
    }, [assetCache, assetStore, loadErrors, registerModel, registerSound, registerTexture, trackLoad]);
    const acquireAsset = useCallback((dependency: AssetDependency) => {
        const lease = acquire(dependency.kind, dependency.path);
        return { ready: lease.ready.then(entry => entry.value), release: lease.release };
    }, [acquire]);
    const load = useCallback(async (type: AssetDependency['kind'], path: string, source?: () => Promise<Object3D | Texture | AudioBuffer>) => {
        const lease = acquire(type, path, source);
        try { await lease.ready; } finally { lease.release(); }
    }, [acquire]);
    const loadModel = useCallback((path: string, source?: () => Promise<Object3D>) => load('model', path, source), [load]);
    const loadTexture = useCallback((path: string, source?: () => Promise<Texture>) => load('texture', path, source), [load]);
    const loadSound = useCallback((path: string, source?: () => Promise<AudioBuffer>) => load('sound', path, source), [load]);
    const acquireDocument = useCallback((path: string) => prefabCache.acquire(path, () => trackLoad(fetch(path).then(response => {
        if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path}`);
        return response.json() as Promise<Prefab>;
    }).then(normalizePrefab))), [prefabCache, trackLoad]);
    const loadPrefab = useCallback(async (path: string) => {
        const lease = acquireDocument(path);
        try { return await lease.ready; } finally { lease.release(); }
    }, [acquireDocument]);
    const getPrefab = useCallback((path: string) => prefabCache.get(path) ?? null, [prefabCache]);
    const prepare = useCallback((path: string, options?: PrefabPreparationOptions) => preparePrefab({
        getComponent: getComponent, acquireDocument, acquireAsset,
    }, path, options), [acquireDocument, acquireAsset]);
    const readModel = useCallback((path: string) => {
        const model = assetStore.getState().models[path];
        if (model) return model;
        const error = loadErrors.get(`model:${path}`);
        if (error) throw error;
        const pending = loadModel(path);
        void pending.catch(() => {});
        throw pending;
    }, [assetStore, loadErrors, loadModel]);
    // Stable runtime: imperative readers do not re-render on asset loads.
    // Reactive consumers use the per-asset selector hooks.
    const runtime = useMemo<InternalAssetRuntime>(() => ({
        loadModel, loadTexture, loadSound, loadPrefab, acquireAsset, preparePrefab: prepare, getPrefab,
        registerModel, registerTexture, registerSound,
        getModel, getTexture, getSound, readModel, trackLoad,
    }), [acquireAsset, prepare, getPrefab, loadModel, loadTexture, loadSound, loadPrefab, registerModel, registerTexture, registerSound, getModel, getTexture, getSound, readModel, trackLoad]);

    useImperativeHandle(runtimeRef, () => runtime, [runtime]);

    return (
        <AssetStoreContext.Provider value={assetStore}>
            <AssetRuntimeContext.Provider value={runtime}>
                {children}
            </AssetRuntimeContext.Provider>
        </AssetStoreContext.Provider>
    );
}

interface CachedAsset {
    type: AssetDependency['kind'];
    path: string;
    value: Object3D | Texture | AudioBuffer;
    owned: boolean;
}
const assetStoreLifetime = new WeakMap<AssetStoreApi, object>();
function disposeAsset(asset: CachedAsset) {
    if (asset.type === 'sound') soundManager.removeBuffer(asset.path, asset.value as AudioBuffer);
    if (asset.type === 'texture') (asset.value as Texture).dispose();
    if (asset.type !== 'model') return;
    const resources = new Set<{ dispose(): void }>();
    (asset.value as Object3D).traverse(object => {
        if (!(object instanceof Mesh)) return;
        resources.add(object.geometry);
        const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
            resources.add(material);
            Object.values(material).forEach(value => {
                if (value && typeof value === 'object' && value.isTexture) resources.add(value);
            });
        });
    });
    resources.forEach(resource => resource.dispose());
}
