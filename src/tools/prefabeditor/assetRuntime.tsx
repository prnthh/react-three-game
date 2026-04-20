import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Object3D, Texture } from "three";

export interface AssetRuntime {
    registerRigidBodyRef: (id: string, rb: any) => void;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
    getAssetRevision: () => string;
    getObject: (id: string) => Object3D | null;
    getRigidBody: (id: string) => any;
}

export interface AssetRuntimeContextValue extends AssetRuntime { }

export interface EntityRuntime {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    getObject: <T extends Object3D = Object3D>() => T | null;
    getRigidBody: <T = any>() => T | null;
}

export interface LiveRef<T> { readonly current: T | null; }
export type LiveObjectRef<T extends Object3D = Object3D> = LiveRef<T>;
export type LiveRigidBodyRef<T = any> = LiveRef<T>;

export const AssetRuntimeContext = createContext<AssetRuntimeContextValue | null>(null);
const EntityRuntimeContext = createContext<EntityRuntime | null>(null);

export function useAssetRuntime(): AssetRuntime {
    const ctx = useContext(AssetRuntimeContext);
    if (!ctx) throw new Error("useAssetRuntime must be used inside <PrefabRoot>");
    return ctx;
}

export function useEntityRuntime(): EntityRuntime {
    const ctx = useContext(EntityRuntimeContext);
    if (!ctx) throw new Error("useEntityRuntime must be used inside a component View rendered by <PrefabRoot>");
    return ctx;
}

export function useEntityObjectRef<T extends Object3D = Object3D>(): LiveRef<T> {
    const { getObject } = useEntityRuntime();
    return useMemo(() => ({ get current() { return getObject<T>(); } }), [getObject]);
}

export function useEntityRigidBodyRef<T = any>(): LiveRef<T> {
    const { getRigidBody } = useEntityRuntime();
    return useMemo(() => ({ get current() { return getRigidBody<T>(); } }), [getRigidBody]);
}

export function EntityRuntimeScope({
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
    if (!asset) throw new Error("EntityRuntimeScope must be used inside <PrefabRoot>");

    const value = useMemo<EntityRuntime>(() => ({
        nodeId,
        editMode,
        isSelected,
        getObject: <T extends Object3D = Object3D>() => asset.getObject(nodeId) as T | null,
        getRigidBody: <T = any>() => asset.getRigidBody(nodeId) as T | null,
    }), [asset, editMode, isSelected, nodeId]);

    return <EntityRuntimeContext.Provider value={value}>{children}</EntityRuntimeContext.Provider>;
}