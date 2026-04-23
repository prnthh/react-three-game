import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Object3D, Texture } from "three";

export interface AssetRuntime {
    registerNodeHandle: (id: string, kind: string, handle: unknown) => void;
    getNodeHandle: <T = unknown>(id: string, kind: string) => T | null;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
    getAssetRevision: () => string;
    getNodeObject: (id: string) => Object3D | null;
}

export interface AssetRuntimeContextValue extends AssetRuntime { }

export interface CurrentNodeRuntime {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    getCurrentNodeObject: <T extends Object3D = Object3D>() => T | null;
    getCurrentNodeHandle: <T = unknown>(kind: string) => T | null;
}

export interface LiveRef<T> { readonly current: T | null; }
export type LiveObjectRef<T extends Object3D = Object3D> = LiveRef<T>;
export type LiveHandleRef<T = unknown> = LiveRef<T>;
export type CurrentNodeObjectRef<T extends Object3D = Object3D> = LiveObjectRef<T>;
export type CurrentNodeHandleRef<T = unknown> = LiveHandleRef<T>;

export const AssetRuntimeContext = createContext<AssetRuntimeContextValue | null>(null);
const CurrentNodeRuntimeContext = createContext<CurrentNodeRuntime | null>(null);

export function useAssetRuntime(): AssetRuntime {
    const ctx = useContext(AssetRuntimeContext);
    if (!ctx) throw new Error("useAssetRuntime must be used inside <PrefabRoot>");
    return ctx;
}

export function useCurrentNode(): CurrentNodeRuntime {
    const ctx = useContext(CurrentNodeRuntimeContext);
    if (!ctx) throw new Error("useCurrentNode must be used inside a component View rendered by <PrefabRoot>");
    return ctx;
}

export function useCurrentNodeObject<T extends Object3D = Object3D>(): LiveRef<T> {
    const { getCurrentNodeObject } = useCurrentNode();
    return useMemo(() => ({ get current() { return getCurrentNodeObject<T>(); } }), [getCurrentNodeObject]);
}

export function useCurrentNodeHandle<T = unknown>(kind: string): LiveRef<T> {
    const { getCurrentNodeHandle } = useCurrentNode();
    return useMemo(() => ({ get current() { return getCurrentNodeHandle<T>(kind); } }), [getCurrentNodeHandle, kind]);
}

export function CurrentNodeScope({
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
    if (!asset) throw new Error("CurrentNodeScope must be used inside <PrefabRoot>");

    const value = useMemo<CurrentNodeRuntime>(() => ({
        nodeId,
        editMode,
        isSelected,
        getCurrentNodeObject: <T extends Object3D = Object3D>() => asset.getNodeObject(nodeId) as T | null,
        getCurrentNodeHandle: <T = unknown>(kind: string) => asset.getNodeHandle(nodeId, kind) as T | null,
    }), [asset, editMode, isSelected, nodeId]);

    return <CurrentNodeRuntimeContext.Provider value={value}>{children}</CurrentNodeRuntimeContext.Provider>;
}