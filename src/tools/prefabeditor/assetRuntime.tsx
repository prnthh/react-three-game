import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
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
    getAssetRevision: () => string;
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
    const [models, setModels] = useState<LoadedModels>({});
    const [textures, setTextures] = useState<LoadedTextures>({});
    const [sounds, setSounds] = useState<LoadedSounds>({});
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
        setModels(prev => prev[path] === model ? prev : { ...prev, [path]: model });
    }, []);
    const registerTexture = useCallback((path: string, texture: Texture) => {
        setTextures(prev => prev[path] === texture ? prev : { ...prev, [path]: texture });
    }, []);
    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        soundManager.setBuffer(path, sound);
        setSounds(prev => prev[path] === sound ? prev : { ...prev, [path]: sound });
    }, []);

    const getObject = useCallback((id: string) => objectRefs.current[id] ?? null, []);
    const getHandle = useCallback(<T = unknown,>(id: string, kind: string) => {
        return (nodeHandles.current.get(id)?.get(kind) as T | undefined) ?? null;
    }, []);
    const getModel = useCallback((path: string) => models[path] ?? null, [models]);
    const getTexture = useCallback((path: string) => textures[path] ?? null, [textures]);
    const getSound = useCallback((path: string) => sounds[path] ?? null, [sounds]);

    const assetRevision = useMemo(
        () => `${Object.keys(textures).sort().join('|')}::${Object.keys(models).sort().join('|')}`,
        [models, textures],
    );

    const runtime = useMemo<AssetRuntime>(() => ({
        models, textures, sounds,
        registerObject, registerHandle,
        registerModel, registerTexture, registerSound,
        getObject, getHandle, getModel, getTexture, getSound,
        getAssetRevision: () => assetRevision,
    }), [models, textures, sounds, registerObject, registerHandle, registerModel, registerTexture, registerSound, getObject, getHandle, getModel, getTexture, getSound, assetRevision]);

    if (runtimeRef) runtimeRef.current = runtime;

    return (
        <AssetRuntimeContext.Provider value={runtime}>
            {children}
        </AssetRuntimeContext.Provider>
    );
}
