import { useThree } from '@react-three/fiber';
import type { PrefabDocumentApi } from '../../core/prefabDocumentApi.js';
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Object3D, Texture } from "three";
import type { GameObject } from "../../core/types.js";
import { createGameObjectHandle } from "./gameObject.js";
import type { NodeInteractionHandlers } from "./usePointerEvents.js";

export enum PrefabEditorMode {
    Edit = "edit",
    Play = "play",
}

export type PrefabNode = Omit<GameObject, "children">;

export interface PrefabRegistry {
    registerObject(id: string, object: Object3D | null): () => void;
    subscribeObject(id: string, listener: () => void): () => void;
    getObject(id: string): Object3D | null;
}

declare const NODE_COMPONENT_VALUE: unique symbol;
export type NodeComponentType<T> = symbol & { readonly [NODE_COMPONENT_VALUE]?: T };

export type SceneComponent<T> = Readonly<{
    /** Registry identity; graph entries use Three UUIDs, gameplay entries use scoped node IDs. */
    key: string;
    value: T;
}>;

const EMPTY_SCENE_COMPONENTS: readonly SceneComponent<never>[] = [];

export interface NodeComponentRegistry {
    get<T>(nodeId: string, type: NodeComponentType<T>): T | null;
    register<T>(nodeId: string, type: NodeComponentType<T>, value: T | null): () => void;
    /** Coalesce notifications; writes are immediate and are not rolled back on exceptions. */
    batch<T>(action: () => T): T;
    getAll<T>(type: NodeComponentType<T>): readonly SceneComponent<T>[];
    subscribe<T>(type: NodeComponentType<T>, listener: () => void): () => void;
}

export function createNodeComponentType<T>(name: string): NodeComponentType<T> {
    return Symbol(name) as NodeComponentType<T>;
}

export function createNodeComponentRegistry(): NodeComponentRegistry {
    const components = new Map<symbol, Map<string, { value: unknown; owner: object }>>();
    const snapshots = new Map<symbol, readonly SceneComponent<unknown>[]>();
    const listeners = new Map<symbol, Set<() => void>>();
    const pending = new Set<symbol>();
    let depth = 0;
    let flushing = false;
    const flush = () => {
        if (depth || flushing) return;
        flushing = true;
        try {
            while (pending.size) {
                const types = [...pending];
                pending.clear();
                for (const type of types) listeners.get(type)?.forEach(listener => listener());
            }
        } finally { flushing = false; }
    };
    const changed = (type: symbol) => {
        snapshots.delete(type);
        pending.add(type);
        flush();
    };
    return {
        get: <T,>(nodeId: string, type: NodeComponentType<T>) => (components.get(type)?.get(nodeId)?.value as T | undefined) ?? null,
        register(nodeId, type, value) {
            let values = components.get(type);
            const previous = values?.get(nodeId);
            if (value == null) {
                if (previous) {
                    values!.delete(nodeId);
                    if (!values!.size) components.delete(type);
                    changed(type);
                }
                return () => {};
            }
            if (!values) components.set(type, values = new Map());
            const owner = {};
            values.set(nodeId, { value, owner });
            if (previous?.value !== value) changed(type);
            return () => {
                const current = components.get(type);
                if (current?.get(nodeId)?.owner !== owner) return;
                current.delete(nodeId);
                if (!current.size) components.delete(type);
                changed(type);
            };
        },
        batch(action) {
            depth++;
            try { return action(); }
            finally { depth--; flush(); }
        },
        getAll: <T,>(type: NodeComponentType<T>): readonly SceneComponent<T>[] => {
            let snapshot = snapshots.get(type);
            if (!snapshot) {
                const current = components.get(type);
                snapshot = current ? Array.from(current, ([key, { value }]) => ({ key, value })) : EMPTY_SCENE_COMPONENTS;
                snapshots.set(type, snapshot);
            }
            return snapshot as readonly SceneComponent<T>[];
        },
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

const sceneComponentRegistries = new WeakMap<Object3D, NodeComponentRegistry>();

/** One live component registry per Three scene, shared with imperative consumers. */
export function getSceneComponentRegistry(scene: Object3D): NodeComponentRegistry {
    let registry = sceneComponentRegistries.get(scene);
    if (!registry) sceneComponentRegistries.set(scene, registry = createNodeComponentRegistry());
    return registry;
}

export function createPrefabRegistry(): PrefabRegistry {
    const objects = new Map<string, Object3D>();
    const owners = new Map<string, object>();
    const listeners = new Map<string, Set<() => void>>();

    return {
        registerObject(id, object) {
            const previous = objects.get(id) ?? null;
            const owner = {};
            if (object) { objects.set(id, object); owners.set(id, owner); }
            else { objects.delete(id); owners.delete(id); }
            if (previous !== object) listeners.get(id)?.forEach(listener => listener());
            return () => {
                if (owners.get(id) !== owner) return;
                owners.delete(id);
                objects.delete(id);
                listeners.get(id)?.forEach(listener => listener());
            };
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



/** Combined facade retained for editor/viewer refs and resource integrations. */
export interface PrefabApi extends PrefabDocumentApi, PrefabRegistry {
    root: Object3D | null;
    basePath: string;
    getModel(path: string): Object3D | null;
    addModel(path: string, model: Object3D): void;
    addTexture(path: string, texture: Texture): void;
    addSound(path: string, sound: AudioBuffer): void;
}

export const SceneContext = createContext<Scene | null>(null);
export const PrefabContext = createContext<PrefabApi | null>(null);
export const NodeComponentContext = createContext<NodeComponentRegistry | null>(null);
interface NodeStore {
    current: NodeApi;
    published: NodeApi;
    listeners: Set<() => void>;
    subscribe(listener: () => void): () => void;
}
const NodeContext = createContext<NodeStore | null>(null);
export const RuntimeNodeIdPrefixContext = createContext("");
/** Mode is read at each node boundary without threading it through the authored tree. */
export const PrefabModeContext = createContext(false);

/** Owns one runtime-component index for the complete scene. */
export function SceneComponentsProvider({ children }: { children: ReactNode }) {
    return <SceneComponentsOwner>{children}</SceneComponentsOwner>;
}

function SceneComponentsOwner({ children }: { children: ReactNode }) {
    const scene = useThree(state => state.scene);
    const registry = getSceneComponentRegistry(scene);
    return <NodeComponentContext.Provider value={registry}>{children}</NodeComponentContext.Provider>;
}

export interface NodeApi {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    nodeInteractionHandlers?: NodeInteractionHandlers;
}

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

const selectNode = (node: NodeApi) => node;

/** Select a stable node value to skip renders when other node fields change. */
export function useNode(): NodeApi;
export function useNode<T>(selector: (node: NodeApi) => T): T;
export function useNode<T>(selector?: (node: NodeApi) => T): NodeApi | T {
    const store = useContext(NodeContext);
    if (!store) throw new Error("useNode must be used inside a component View rendered by <PrefabRoot>");
    const select: (node: NodeApi) => NodeApi | T = selector ?? selectNode;
    return useSyncExternalStore(store.subscribe, () => select(store.current), () => select(store.current));
}

function useNodeComponentRegistry() {
    const registry = useContext(NodeComponentContext);
    if (!registry) throw new Error("Node component registry is unavailable outside PrefabRoot");
    return registry;
}

export function useRegisterNodeComponent<T>(type: NodeComponentType<T>, value: T | null) {
    const { id: runtimeNodeId } = useGameObject();
    const registry = useNodeComponentRegistry();
    useLayoutEffect(() => value == null ? undefined : registry.register(runtimeNodeId, type, value), [registry, runtimeNodeId, type, value]);
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

/** Resolve a local prefab reference, or the current node when no id is supplied. */
export function useGameObject(nodeId?: string) {
    const prefab = usePrefab();
    const node = useContext(NodeContext);
    const prefix = useContext(RuntimeNodeIdPrefixContext);
    const components = useNodeComponentRegistry();
    const localId = nodeId ?? node?.current.nodeId;
    if (localId === undefined) throw new Error('useGameObject requires a node id outside a component View');
    return useMemo(() => createGameObjectHandle(localId, prefix, prefab, components), [localId, prefix, prefab, components]);
}

export function NodeScope({
    nodeId,
    editMode,
    isSelected,
    nodeInteractionHandlers,
    children,
}: {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    nodeInteractionHandlers?: NodeInteractionHandlers;
    children: ReactNode;
}) {
    const storeRef = useRef<NodeStore | null>(null);
    if (!storeRef.current) {
        const initial = { nodeId, editMode, isSelected, nodeInteractionHandlers };
        const listeners = new Set<() => void>();
        storeRef.current = {
            current: initial,
            published: initial,
            listeners,
            subscribe(listener) {
                listeners.add(listener);
                return () => { listeners.delete(listener); };
            },
        };
    }
    const store = storeRef.current;
    // Children rendered in this commit must read the new props; listeners are notified after commit.
    const previous = store.current;
    if (previous.nodeId !== nodeId || previous.editMode !== editMode || previous.isSelected !== isSelected ||
        previous.nodeInteractionHandlers !== nodeInteractionHandlers) {
        store.current = { nodeId, editMode, isSelected, nodeInteractionHandlers };
    }
    useLayoutEffect(() => {
        if (store.published !== store.current) {
            store.published = store.current;
            store.listeners.forEach(listener => listener());
        }
    });

    return <NodeContext.Provider value={store}>{children}</NodeContext.Provider>;
}

export function RuntimeNodeIdScope({ prefix, children }: { prefix: string; children: ReactNode }) {
    const parentPrefix = useContext(RuntimeNodeIdPrefixContext);
    const value = prefix ? (parentPrefix ? `${parentPrefix}/${prefix}` : prefix) : parentPrefix;
    return <RuntimeNodeIdPrefixContext.Provider value={value}>{children}</RuntimeNodeIdPrefixContext.Provider>;
}
