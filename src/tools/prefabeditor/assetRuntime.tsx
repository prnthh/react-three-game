import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Object3D, Texture } from "three";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { sound as soundManager } from "../../helpers/SoundManager";

export interface AssetRuntime {
    models: LoadedModels;
    textures: LoadedTextures;
    sounds: LoadedSounds;
    registerObject: (id: string, object: Object3D | null) => void;
    registerHandle: (id: string, kind: string, handle: unknown) => void;
    registerModel: (path: string, model: Object3D) => void;
    registerTexture: (path: string, texture: Texture) => void;
    registerSound: (path: string, sound: AudioBuffer) => void;
    getHandle: <T = unknown>(id: string, kind: string) => T | null;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
    getAssetRevision: () => number;
    getObject: (id: string) => Object3D | null;
}

export interface NodeApi {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    getObject: <T extends Object3D = Object3D>() => T | null;
    getHandle: <T = unknown>(kind: string) => T | null;
}

export interface LiveRef<T> { readonly current: T | null; }

export interface AssetRuntimeProviderProps {
    children: ReactNode;
    runtimeRef?: React.MutableRefObject<AssetRuntime | null>;
}

export const AssetRuntimeContext = createContext<AssetRuntime | null>(null);
const NodeContext = createContext<NodeApi | null>(null);

/**
 * Reactive backing store for loaded assets. Components subscribe to the single
 * asset slot they care about via the selector hooks below, so loading one asset
 * only re-renders the handful of nodes that reference it — not every consumer of
 * the runtime. `version` is a monotonic counter for the rare consumer that needs
 * a coarse "something loaded" signal (e.g. baked environment maps).
 */
interface AssetStoreState {
    models: LoadedModels;
    textures: LoadedTextures;
    sounds: LoadedSounds;
    version: number;
}

type AssetStoreApi = StoreApi<AssetStoreState>;

function createAssetStore(): AssetStoreApi {
    return createStore<AssetStoreState>(() => ({ models: {}, textures: {}, sounds: {}, version: 0 }));
}

const AssetStoreContext = createContext<AssetStoreApi | null>(null);

function useAssetStore(): AssetStoreApi {
    const store = useContext(AssetStoreContext);
    if (!store) throw new Error("Asset hooks must be used inside <PrefabRoot>");
    return store;
}

/** Subscribe to a single loaded model; re-renders only when that model changes. */
export function useModelAsset(path?: string | null): Object3D | null {
    return useStore(useAssetStore(), s => (path ? s.models[path] ?? null : null));
}

/** Subscribe to a single loaded texture; re-renders only when that texture changes. */
export function useTextureAsset(path?: string | null): Texture | null {
    return useStore(useAssetStore(), s => (path ? s.textures[path] ?? null : null));
}

/** Subscribe to a single loaded sound; re-renders only when that sound changes. */
export function useSoundAsset(path?: string | null): AudioBuffer | null {
    return useStore(useAssetStore(), s => (path ? s.sounds[path] ?? null : null));
}

/** Subscribe to the full model map (only needed by the instancing root). */
export function useAllModels(): LoadedModels {
    return useStore(useAssetStore(), s => s.models);
}

/** Coarse "an asset was (un)registered" signal. */
export function useAssetRevision(): number {
    return useStore(useAssetStore(), s => s.version);
}

export function useAssetRuntime(): AssetRuntime {
    const ctx = useContext(AssetRuntimeContext);
    if (!ctx) throw new Error("useAssetRuntime must be used inside <PrefabRoot>");
    return ctx;
}

export function useNode(): NodeApi {
    const ctx = useContext(NodeContext);
    if (!ctx) throw new Error("useNode must be used inside a component View rendered by <PrefabRoot>");
    return ctx;
}

export function useNodeObject<T extends Object3D = Object3D>(): LiveRef<T> {
    const { getObject } = useNode();
    return useMemo(() => ({ get current() { return getObject<T>(); } }), [getObject]);
}

export function useNodeHandle<T = unknown>(kind: string): LiveRef<T> {
    const { getHandle } = useNode();
    return useMemo(() => ({ get current() { return getHandle<T>(kind); } }), [getHandle, kind]);
}

export function NodeScope({
    nodeId,
    editMode,
    isSelected,
    children,
}: {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    children: ReactNode;
}) {
    const asset = useContext(AssetRuntimeContext);
    if (!asset) throw new Error("NodeScope must be used inside <PrefabRoot>");

    const value = useMemo<NodeApi>(() => ({
        nodeId,
        editMode,
        isSelected,
        getObject: <T extends Object3D = Object3D>() => asset.getObject(nodeId) as T | null,
        getHandle: <T = unknown>(kind: string) => asset.getHandle(nodeId, kind) as T | null,
    }), [asset, editMode, isSelected, nodeId]);

    return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
}

/**
 * Recursive provider: if an AssetRuntime is already present above, this is a
 * pass-through. Otherwise this layer becomes the owner and allocates state.
 */
export function AssetRuntimeProvider({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const inherited = useContext(AssetRuntimeContext);
    if (inherited !== null) {
        if (runtimeRef) runtimeRef.current = inherited;
        return children;
    }
    return <AssetRuntimeOwner runtimeRef={runtimeRef}>{children}</AssetRuntimeOwner>;
}

function AssetRuntimeOwner({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const [assetStore] = useState(createAssetStore);
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const nodeHandles = useRef<Map<string, Map<string, unknown>>>(new Map());

    const registerObject = useCallback((id: string, obj: Object3D | null) => {
        if (obj) objectRefs.current[id] = obj;
        else delete objectRefs.current[id];
    }, []);

    const registerHandle = useCallback((id: string, kind: string, handle: unknown) => {
        const current = nodeHandles.current.get(id);
        if (handle == null) {
            if (!current) return;
            current.delete(kind);
            if (current.size === 0) nodeHandles.current.delete(id);
            return;
        }
        if (current) { current.set(kind, handle); return; }
        nodeHandles.current.set(id, new Map([[kind, handle]]));
    }, []);

    const registerModel = useCallback((path: string, model: Object3D) => {
        if (assetStore.getState().models[path] === model) return;
        assetStore.setState(s => ({ models: { ...s.models, [path]: model }, version: s.version + 1 }));
    }, [assetStore]);
    const registerTexture = useCallback((path: string, texture: Texture) => {
        if (assetStore.getState().textures[path] === texture) return;
        assetStore.setState(s => ({ textures: { ...s.textures, [path]: texture }, version: s.version + 1 }));
    }, [assetStore]);
    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        soundManager.setBuffer(path, sound);
        if (assetStore.getState().sounds[path] === sound) return;
        assetStore.setState(s => ({ sounds: { ...s.sounds, [path]: sound }, version: s.version + 1 }));
    }, [assetStore]);

    const getObject = useCallback((id: string) => objectRefs.current[id] ?? null, []);
    const getHandle = useCallback(<T = unknown,>(id: string, kind: string) => {
        return (nodeHandles.current.get(id)?.get(kind) as T | undefined) ?? null;
    }, []);
    const getModel = useCallback((path: string) => assetStore.getState().models[path] ?? null, [assetStore]);
    const getTexture = useCallback((path: string) => assetStore.getState().textures[path] ?? null, [assetStore]);
    const getSound = useCallback((path: string) => assetStore.getState().sounds[path] ?? null, [assetStore]);
    const getAssetRevision = useCallback(() => assetStore.getState().version, [assetStore]);

    // Stable runtime: all members have stable identity, so consumers that only
    // use imperative getters/registrars never re-render on asset loads. The
    // live maps are exposed as snapshot getters for imperative readers; reactive
    // consumers use the selector hooks (useModelAsset, useAllModels, ...).
    const runtime = useMemo<AssetRuntime>(() => ({
        get models() { return assetStore.getState().models; },
        get textures() { return assetStore.getState().textures; },
        get sounds() { return assetStore.getState().sounds; },
        registerObject, registerHandle,
        registerModel, registerTexture, registerSound,
        getObject, getHandle, getModel, getTexture, getSound,
        getAssetRevision,
    }), [assetStore, registerObject, registerHandle, registerModel, registerTexture, registerSound, getObject, getHandle, getModel, getTexture, getSound, getAssetRevision]);

    if (runtimeRef) runtimeRef.current = runtime;

    return (
        <AssetStoreContext.Provider value={assetStore}>
            <AssetRuntimeContext.Provider value={runtime}>
                {children}
            </AssetRuntimeContext.Provider>
        </AssetStoreContext.Provider>
    );
}
