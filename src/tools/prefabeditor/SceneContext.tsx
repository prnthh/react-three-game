import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Object3D, Texture } from "three";
import type { GameObject, Prefab, PrefabMaterial } from "./types";
import type { NodeInteractionHandlers } from "./usePointerEvents";

export enum PrefabEditorMode {
    Edit = "edit",
    Play = "play",
}

export type PrefabNode = Omit<GameObject, "children">;

export interface PrefabRegistry {
    registerObject(id: string, object: Object3D | null): void;
    subscribeObject(id: string, listener: () => void): () => void;
    registerHandle(id: string, kind: string, handle: unknown): void;
    getObject(id: string): Object3D | null;
    getHandle<T = unknown>(id: string, kind: string): T | null;
}

export function createPrefabRegistry(): PrefabRegistry {
    const objects = new Map<string, Object3D>();
    const listeners = new Map<string, Set<() => void>>();
    const handles = new Map<string, Map<string, unknown>>();

    return {
        registerObject(id, object) {
            if ((objects.get(id) ?? null) === object) return;
            if (object) objects.set(id, object);
            else objects.delete(id);
            listeners.get(id)?.forEach(listener => listener());
        },
        subscribeObject(id, listener) {
            const nodeListeners = listeners.get(id) ?? new Set<() => void>();
            nodeListeners.add(listener);
            listeners.set(id, nodeListeners);
            return () => {
                nodeListeners.delete(listener);
                if (nodeListeners.size === 0) listeners.delete(id);
            };
        },
        registerHandle(id, kind, handle) {
            const nodeHandles = handles.get(id);
            if (handle == null) {
                nodeHandles?.delete(kind);
                if (nodeHandles?.size === 0) handles.delete(id);
            } else if (nodeHandles) {
                nodeHandles.set(kind, handle);
            } else {
                handles.set(id, new Map([[kind, handle]]));
            }
        },
        getObject: id => objects.get(id) ?? null,
        getHandle: <T = unknown,>(id: string, kind: string) => (
            (handles.get(id)?.get(kind) as T | undefined) ?? null
        ),
    };
}

export interface Scene {
    root: Object3D | null;
    mode: PrefabEditorMode;
}

export interface PrefabApi extends PrefabRegistry {
    root: Object3D | null;
    basePath: string;
    get(id: string): GameObject | null;
    getModel(path: string): Object3D | null;
    getMaterial(id: string): PrefabMaterial | null;
    add(node: GameObject, parentId?: string): GameObject;
    update(id: string, fn: (node: PrefabNode) => PrefabNode): void;
    setMaterial(id: string, material: PrefabMaterial): void;
    replaceNode(id: string, node: GameObject): void;
    remove(id: string): void;
    duplicate(id: string): string | null;
    move(draggedId: string, targetId: string, position: "before" | "inside"): void;
    replace(prefab: Prefab): void;
    addModel(path: string, model: Object3D): void;
    addTexture(path: string, texture: Texture): void;
    addSound(path: string, sound: AudioBuffer): void;
}

export const SceneContext = createContext<Scene | null>(null);
export const PrefabContext = createContext<PrefabApi | null>(null);
const NodeContext = createContext<NodeApi | null>(null);

export interface NodeApi {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    nodeInteractionHandlers?: NodeInteractionHandlers;
    worldPosition?: [number, number, number];
    getObject<T extends Object3D = Object3D>(): T | null;
    getHandle<T = unknown>(kind: string): T | null;
}

export interface LiveRef<T> { readonly current: T | null; }

export function useScene() {
    const scene = useContext(SceneContext);
    if (!scene) {
        throw new Error("useScene must be used within a PrefabRoot or PrefabEditor scene provider");
    }
    return scene;
}

export function usePrefab() {
    const prefab = useContext(PrefabContext);
    if (!prefab) {
        throw new Error("usePrefab must be used within a PrefabRoot or PrefabEditor");
    }
    return prefab;
}

export function useNode() {
    const node = useContext(NodeContext);
    if (!node) throw new Error("useNode must be used inside a component View rendered by <PrefabRoot>");
    return node;
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
    nodeInteractionHandlers,
    worldPosition,
    children,
}: {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    nodeInteractionHandlers?: NodeInteractionHandlers;
    worldPosition?: [number, number, number];
    children: ReactNode;
}) {
    const prefab = usePrefab();
    const value = useMemo<NodeApi>(() => ({
        nodeId,
        editMode,
        isSelected,
        nodeInteractionHandlers,
        worldPosition,
        getObject: <T extends Object3D = Object3D>() => prefab.getObject(nodeId) as T | null,
        getHandle: <T = unknown,>(kind: string) => prefab.getHandle<T>(nodeId, kind),
    }), [editMode, isSelected, nodeId, nodeInteractionHandlers, prefab, worldPosition]);

    return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
}
