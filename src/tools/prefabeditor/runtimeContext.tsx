import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Object3D, Texture } from "three";

type RuntimeScopeProps = {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    children: ReactNode;
};

function createLiveRef<T>(getCurrent: () => T | null) {
    return {
        get current() {
            return getCurrent();
        },
    };
}

export interface AssetRuntime {
    registerRigidBodyRef: (id: string, rb: any) => void;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
    getAssetRevision: () => string;
}

export interface AssetRuntimeContextValue extends AssetRuntime {
    getObject: (id: string) => Object3D | null;
    getRigidBody: (id: string) => any;
}

export interface EntityRuntime {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    getObject: <T extends Object3D = Object3D>() => T | null;
    getRigidBody: <T = any>() => T | null;
}

export interface LiveObjectRef<T extends Object3D = Object3D> {
    readonly current: T | null;
}

export interface LiveRigidBodyRef<T = any> {
    readonly current: T | null;
}

export const AssetRuntimeContext = createContext<AssetRuntimeContextValue | null>(null);
export const EntityRuntimeContext = createContext<EntityRuntime | null>(null);

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

export function useEntityObjectRef<T extends Object3D = Object3D>(): LiveObjectRef<T> {
    const { getObject } = useEntityRuntime();

    return useMemo(() => createLiveRef(() => getObject<T>()), [getObject]);
}

export function useEntityRigidBodyRef<T = any>(): LiveRigidBodyRef<T> {
    const { getRigidBody } = useEntityRuntime();

    return useMemo(() => createLiveRef(() => getRigidBody<T>()), [getRigidBody]);
}

export function EntityRuntimeScope({
    nodeId,
    editMode,
    isSelected,
    children,
}: RuntimeScopeProps) {
    const assetRuntime = useContext(AssetRuntimeContext);
    if (!assetRuntime) throw new Error("EntityRuntimeScope must be used inside <PrefabRoot>");

    const { getObject, getRigidBody } = assetRuntime;
    const value = useMemo<EntityRuntime>(() => ({
        nodeId,
        editMode,
        isSelected,
        getObject: <T extends Object3D = Object3D>() => getObject(nodeId) as T | null,
        getRigidBody: <T = any>() => getRigidBody(nodeId) as T | null,
    }), [editMode, getObject, getRigidBody, isSelected, nodeId]);

    return <EntityRuntimeContext.Provider value={value}>{children}</EntityRuntimeContext.Provider>;
}
