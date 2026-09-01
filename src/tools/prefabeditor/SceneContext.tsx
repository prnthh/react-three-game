import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
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
    getObject(id: string): Object3D | null;
}

declare const NODE_COMPONENT_VALUE: unique symbol;
export type NodeComponentType<T> = symbol & { readonly [NODE_COMPONENT_VALUE]?: T };

export type SceneComponent<T> = Readonly<{
    nodeId: string;
    value: T;
}>;

const EMPTY_SCENE_COMPONENTS: readonly SceneComponent<never>[] = [];

export interface NodeComponentRegistry {
    register<T>(nodeId: string, type: NodeComponentType<T>, value: T | null): void;
    getAll<T>(type: NodeComponentType<T>): readonly SceneComponent<T>[];
    subscribe<T>(type: NodeComponentType<T>, listener: () => void): () => void;
}

export function createNodeComponentType<T>(name: string): NodeComponentType<T> {
    return Symbol(name) as NodeComponentType<T>;
}

export function createNodeComponentRegistry(): NodeComponentRegistry {
    const components = new Map<symbol, Map<string, unknown>>();
    const snapshots = new Map<symbol, readonly SceneComponent<unknown>[]>();
    const listeners = new Map<symbol, Set<() => void>>();
    return {
        register(nodeId, type, value) {
            const values = components.get(type);
            if ((values?.get(nodeId) ?? null) === value) return;
            if (value == null) {
                values?.delete(nodeId);
                if (values?.size === 0) components.delete(type);
            } else if (values) {
                values.set(nodeId, value);
            } else {
                components.set(type, new Map([[nodeId, value]]));
            }
            const current = components.get(type);
            snapshots.set(type, current
                ? Array.from(current, ([registeredNodeId, registeredValue]) => ({
                    nodeId: registeredNodeId,
                    value: registeredValue,
                }))
                : []);
            listeners.get(type)?.forEach(listener => listener());
        },
        getAll: <T,>(type: NodeComponentType<T>) => (
            (snapshots.get(type) as readonly SceneComponent<T>[] | undefined) ?? EMPTY_SCENE_COMPONENTS
        ),
        subscribe(type, listener) {
            const typeListeners = listeners.get(type) ?? new Set<() => void>();
            typeListeners.add(listener);
            listeners.set(type, typeListeners);
            return () => {
                typeListeners.delete(listener);
                if (typeListeners.size === 0) listeners.delete(type);
            };
        },
    };
}

export function createPrefabRegistry(): PrefabRegistry {
    const objects = new Map<string, Object3D>();
    const listeners = new Map<string, Set<() => void>>();

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
        getObject: id => objects.get(id) ?? null,
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
export const NodeComponentContext = createContext<NodeComponentRegistry | null>(null);
const NodeContext = createContext<NodeApi | null>(null);
const RuntimeNodeIdPrefixContext = createContext("");
const PrefabRenderCacheContext = createContext<WeakMap<GameObject, unknown> | null>(null);

/** Owns one runtime-component index for the complete scene. */
export function SceneComponentsProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(NodeComponentContext);
    if (inherited) return children;
    return <SceneComponentsOwner>{children}</SceneComponentsOwner>;
}

function SceneComponentsOwner({ children }: { children: ReactNode }) {
    const [registry] = useState(createNodeComponentRegistry);
    return <NodeComponentContext.Provider value={registry}>{children}</NodeComponentContext.Provider>;
}

/** Caches immutable component plans for every prefab definition in the scene. */
export function PrefabRenderCacheProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(PrefabRenderCacheContext);
    if (inherited) return children;
    return <PrefabRenderCacheOwner>{children}</PrefabRenderCacheOwner>;
}

function PrefabRenderCacheOwner({ children }: { children: ReactNode }) {
    const [cache] = useState(() => new WeakMap<GameObject, unknown>());
    return <PrefabRenderCacheContext.Provider value={cache}>{children}</PrefabRenderCacheContext.Provider>;
}

export function usePrefabRenderCache<T>() {
    const cache = useContext(PrefabRenderCacheContext);
    if (!cache) throw new Error("Prefab render cache is unavailable outside a scene");
    return cache as WeakMap<GameObject, T>;
}

export interface NodeApi {
    nodeId: string;
    runtimeNodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    nodeInteractionHandlers?: NodeInteractionHandlers;
    worldPosition?: [number, number, number];
    getObject<T extends Object3D = Object3D>(): T | null;
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

function useNodeComponentRegistry() {
    const registry = useContext(NodeComponentContext);
    if (!registry) throw new Error("Node component registry is unavailable outside PrefabRoot");
    return registry;
}

export function useRegisterNodeComponent<T>(type: NodeComponentType<T>, value: T | null) {
    const { runtimeNodeId } = useNode();
    const registry = useNodeComponentRegistry();
    useLayoutEffect(() => {
        registry.register(runtimeNodeId, type, value);
    }, [registry, runtimeNodeId, type, value]);
    useLayoutEffect(() => () => {
        registry.register(runtimeNodeId, type, null);
    }, [registry, runtimeNodeId, type]);
}

export function useSceneComponents<T>(type: NodeComponentType<T>): readonly SceneComponent<T>[] {
    const registry = useNodeComponentRegistry();
    const subscribe = useCallback(
        (listener: () => void) => registry.subscribe(type, listener),
        [registry, type],
    );
    const getSnapshot = useCallback(
        () => registry.getAll(type),
        [registry, type],
    );
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SCENE_COMPONENTS);
}

export function useNodeObject<T extends Object3D = Object3D>(): LiveRef<T> {
    const { getObject } = useNode();
    return useMemo(() => ({ get current() { return getObject<T>(); } }), [getObject]);
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
    const runtimeNodeIdPrefix = useContext(RuntimeNodeIdPrefixContext);
    const runtimeNodeId = runtimeNodeIdPrefix ? `${runtimeNodeIdPrefix}/${nodeId}` : nodeId;
    const value = useMemo<NodeApi>(() => ({
        nodeId,
        runtimeNodeId,
        editMode,
        isSelected,
        nodeInteractionHandlers,
        worldPosition,
        getObject: <T extends Object3D = Object3D>() => prefab.getObject(nodeId) as T | null,
    }), [editMode, isSelected, nodeId, nodeInteractionHandlers, prefab, runtimeNodeId, worldPosition]);

    return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
}

export function RuntimeNodeIdScope({ prefix, children }: { prefix: string; children: ReactNode }) {
    const parentPrefix = useContext(RuntimeNodeIdPrefixContext);
    const value = parentPrefix ? `${parentPrefix}/${prefix}` : prefix;
    return <RuntimeNodeIdPrefixContext.Provider value={value}>{children}</RuntimeNodeIdPrefixContext.Provider>;
}
