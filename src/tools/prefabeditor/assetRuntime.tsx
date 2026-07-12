import { createContext, useCallback, useContext, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Object3D, Texture } from "three";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { sound as soundManager } from "../../helpers/SoundManager";

export interface AssetRuntime {
    registerObject: (id: string, object: Object3D | null) => void;
    subscribeObject: (id: string, listener: () => void) => () => void;
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
    isolateNodes?: boolean;
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
    soundVersions: Record<string, number>;
    visualVersion: number;
    version: number;
}

type AssetStoreApi = StoreApi<AssetStoreState>;

function createAssetStore(): AssetStoreApi {
    return createStore<AssetStoreState>(() => ({ models: {}, textures: {}, sounds: {}, soundVersions: {}, visualVersion: 0, version: 0 }));
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

/** Reacts only when one of the requested sound buffers is replaced or loaded. */
export function useSoundAssetRevision(paths: string[]): string {
    return useStore(useAssetStore(), state => (
        paths.map(path => state.soundVersions[path] ?? 0).join('|')
    ));
}

/** Coarse visual-only signal for systems that rebake when scene imagery changes. */
export function useVisualAssetRevision(): number {
    return useStore(useAssetStore(), s => s.visualVersion);
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
export function AssetRuntimeProvider({ children, runtimeRef, isolateNodes = false }: AssetRuntimeProviderProps) {
    const inherited = useContext(AssetRuntimeContext);
    useImperativeHandle(inherited && !isolateNodes ? runtimeRef : undefined, () => inherited!, [inherited]);

    if (inherited !== null) {
        if (isolateNodes) {
            return <IsolatedNodeRuntime parent={inherited} runtimeRef={runtimeRef}>{children}</IsolatedNodeRuntime>;
        }
        return children;
    }
    return <AssetRuntimeOwner runtimeRef={runtimeRef}>{children}</AssetRuntimeOwner>;
}

function useObjectRegistry() {
    const objects = useRef(new Map<string, Object3D>());
    const listeners = useRef(new Map<string, Set<() => void>>());

    const registerObject = useCallback((id: string, object: Object3D | null) => {
        if ((objects.current.get(id) ?? null) === object) return;
        if (object) objects.current.set(id, object);
        else objects.current.delete(id);
        listeners.current.get(id)?.forEach(listener => listener());
    }, []);
    const subscribeObject = useCallback((id: string, listener: () => void) => {
        const nodeListeners = listeners.current.get(id) ?? new Set<() => void>();
        nodeListeners.add(listener);
        listeners.current.set(id, nodeListeners);
        return () => {
            nodeListeners.delete(listener);
            if (nodeListeners.size === 0) listeners.current.delete(id);
        };
    }, []);
    const getObject = useCallback((id: string) => objects.current.get(id) ?? null, []);

    return { registerObject, subscribeObject, getObject };
}

function useHandleRegistry() {
    const handles = useRef(new Map<string, Map<string, unknown>>());

    const registerHandle = useCallback((id: string, kind: string, handle: unknown) => {
        const nodeHandles = handles.current.get(id);
        if (handle == null) {
            nodeHandles?.delete(kind);
            if (nodeHandles?.size === 0) handles.current.delete(id);
        } else if (nodeHandles) {
            nodeHandles.set(kind, handle);
        } else {
            handles.current.set(id, new Map([[kind, handle]]));
        }
    }, []);
    const getHandle = useCallback(<T = unknown,>(id: string, kind: string) => (
        (handles.current.get(id)?.get(kind) as T | undefined) ?? null
    ), []);

    return { registerHandle, getHandle };
}

function IsolatedNodeRuntime({
    parent,
    children,
    runtimeRef,
}: AssetRuntimeProviderProps & { parent: AssetRuntime }) {
    const { registerObject, subscribeObject, getObject } = useObjectRegistry();
    const { registerHandle, getHandle } = useHandleRegistry();

    const runtime = useMemo<AssetRuntime>(() => ({
        registerObject,
        subscribeObject,
        registerHandle,
        registerModel: parent.registerModel,
        registerTexture: parent.registerTexture,
        registerSound: parent.registerSound,
        getObject,
        getHandle,
        getModel: parent.getModel,
        getTexture: parent.getTexture,
        getSound: parent.getSound,
        getAssetRevision: parent.getAssetRevision,
    }), [getHandle, getObject, parent, registerHandle, registerObject, subscribeObject]);

    useImperativeHandle(runtimeRef, () => runtime, [runtime]);
    return <AssetRuntimeContext.Provider value={runtime}>{children}</AssetRuntimeContext.Provider>;
}

function AssetRuntimeOwner({ children, runtimeRef }: AssetRuntimeProviderProps) {
    const [assetStore] = useState(createAssetStore);
    const { registerObject, subscribeObject, getObject } = useObjectRegistry();
    const { registerHandle, getHandle } = useHandleRegistry();

    const registerModel = useCallback((path: string, model: Object3D) => {
        if (assetStore.getState().models[path] === model) return;
        assetStore.setState(s => ({ models: { ...s.models, [path]: model }, visualVersion: s.visualVersion + 1, version: s.version + 1 }));
    }, [assetStore]);
    const registerTexture = useCallback((path: string, texture: Texture) => {
        if (assetStore.getState().textures[path] === texture) return;
        assetStore.setState(s => ({ textures: { ...s.textures, [path]: texture }, visualVersion: s.visualVersion + 1, version: s.version + 1 }));
    }, [assetStore]);
    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        if (assetStore.getState().sounds[path] === sound) return;
        soundManager.setBuffer(path, sound);
        assetStore.setState(s => ({
            sounds: { ...s.sounds, [path]: sound },
            soundVersions: { ...s.soundVersions, [path]: (s.soundVersions[path] ?? 0) + 1 },
            version: s.version + 1,
        }));
    }, [assetStore]);

    const getModel = useCallback((path: string) => assetStore.getState().models[path] ?? null, [assetStore]);
    const getTexture = useCallback((path: string) => assetStore.getState().textures[path] ?? null, [assetStore]);
    const getSound = useCallback((path: string) => assetStore.getState().sounds[path] ?? null, [assetStore]);
    const getAssetRevision = useCallback(() => assetStore.getState().version, [assetStore]);

    // Stable runtime: imperative readers do not re-render on asset loads.
    // Reactive consumers use the per-asset selector hooks.
    const runtime = useMemo<AssetRuntime>(() => ({
        registerObject, subscribeObject, registerHandle,
        registerModel, registerTexture, registerSound,
        getObject, getHandle, getModel, getTexture, getSound,
        getAssetRevision,
    }), [assetStore, registerObject, subscribeObject, registerHandle, registerModel, registerTexture, registerSound, getObject, getHandle, getModel, getTexture, getSound, getAssetRevision]);

    useImperativeHandle(runtimeRef, () => runtime, [runtime]);

    return (
        <AssetStoreContext.Provider value={assetStore}>
            <AssetRuntimeContext.Provider value={runtime}>
                {children}
            </AssetRuntimeContext.Provider>
        </AssetStoreContext.Provider>
    );
}
