import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Object3D, Texture } from "three";

export interface AssetRuntime {
    registerHandle: (id: string, kind: string, handle: unknown) => void;
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