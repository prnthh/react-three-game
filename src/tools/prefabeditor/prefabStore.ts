import { Fragment, createContext, createElement, type ReactNode, useContext } from "react";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import { createStore, type Mutate, type StoreApi } from "zustand/vanilla";
import { useShallow } from "zustand/react/shallow";

import { GameObject, Prefab, PrefabMaterial } from "./types";
import {
    collectSubtreeIds,
    cloneSubtree,
    denormalizePrefab,
    insertSubtree,
    isDescendant,
    normalizePrefab,
    PrefabState,
    PrefabNodeRecord,
} from "./prefab";

export interface PrefabStoreState extends PrefabState {
    replacePrefab: (prefab: Prefab) => void;
    restoreState: (snapshot: PrefabState) => void;
    updateNode: (id: string, update: (node: PrefabNodeRecord) => PrefabNodeRecord) => void;
    setMaterial: (id: string, material: PrefabMaterial) => void;
    replaceNode: (id: string, node: GameObject) => void;
    addChild: (parentId: string, node: GameObject) => void;
    deleteNode: (id: string) => void;
    duplicateNode: (id: string) => string | null;
    moveNode: (draggedId: string, targetId: string, position: "before" | "inside") => void;
}

export type PrefabStoreApi = Mutate<
    StoreApi<PrefabStoreState>,
    [["zustand/subscribeWithSelector", never]]
>;

const PrefabStoreContext = createContext<PrefabStoreApi | null>(null);
const EMPTY_CHILD_IDS: string[] = [];

function cloneGraphState(state: PrefabStoreState) {
    return {
        nodesById: { ...state.nodesById },
        childIdsById: { ...state.childIdsById },
        parentIdById: { ...state.parentIdById },
    };
}

function removeSubtreeFromGraph(
    id: string,
    state: PrefabStoreState,
    next: ReturnType<typeof cloneGraphState>,
) {
    const ids = collectSubtreeIds(id, state.childIdsById);

    ids.forEach(nodeId => {
        delete next.nodesById[nodeId];
        delete next.childIdsById[nodeId];
        delete next.parentIdById[nodeId];
    });

    return ids;
}

function insertSubtreeIntoGraph(
    node: GameObject,
    parentId: string | null,
    next: ReturnType<typeof cloneGraphState>,
) {
    insertSubtree(node, parentId, next.nodesById, next.childIdsById, next.parentIdById);
}

export function PrefabStoreProvider({
    store,
    children,
}: {
    store: PrefabStoreApi;
    children: ReactNode;
}) {
    const parentStore = useContext(PrefabStoreContext);
    if (parentStore === store) {
        return createElement(Fragment, null, children);
    }

    return createElement(PrefabStoreContext.Provider, { value: store }, children);
}

export function usePrefabStoreApi() {
    const store = useContext(PrefabStoreContext);
    if (!store) {
        throw new Error("usePrefabStoreApi must be used within PrefabStoreProvider");
    }
    return store;
}

export function usePrefabStore<T>(selector: (state: PrefabStoreState) => T) {
    return useStore(usePrefabStoreApi(), selector);
}

export function usePrefabRootId() {
    return usePrefabStore(state => state.rootId);
}

export function usePrefabNode(nodeId: string | null | undefined) {
    return usePrefabStore(state => nodeId ? state.nodesById[nodeId] ?? null : null);
}

export function usePrefabChildIds(nodeId: string | null | undefined) {
    return usePrefabStore(state => nodeId ? state.childIdsById[nodeId] ?? EMPTY_CHILD_IDS : EMPTY_CHILD_IDS);
}

/** Read a render node and its children through one store subscription. */
export function usePrefabRenderNode(nodeId: string) {
    return useStore(usePrefabStoreApi(), useShallow(state => [
        state.nodesById[nodeId] ?? null,
        state.childIdsById[nodeId] ?? EMPTY_CHILD_IDS,
    ] as const));
}

export function createPrefabStore(prefab: Prefab | PrefabState): PrefabStoreApi {
    const initialState = 'nodesById' in prefab ? prefab : normalizePrefab(prefab);
    return createStore<PrefabStoreState>()(subscribeWithSelector((set, get) => ({
        ...initialState,
        replacePrefab: (nextPrefab) => {
            set(normalizePrefab(nextPrefab));
        },
        restoreState: (snapshot) => {
            set({
                prefabId: snapshot.prefabId,
                prefabName: snapshot.prefabName,
                materials: snapshot.materials,
                rootId: snapshot.rootId,
                nodesById: snapshot.nodesById,
                childIdsById: snapshot.childIdsById,
                parentIdById: snapshot.parentIdById,
            });
        },
        updateNode: (id, update) => {
            const state = get();
            const node = state.nodesById[id];
            if (!node) return;

            const nextNode = update(node);
            if (nextNode === node) return;

            set({
                nodesById: { ...state.nodesById, [id]: nextNode },
            });
        },
        setMaterial: (id, material) => {
            const state = get();
            const current = state.materials[id];
            if (current === material) return;
            set({
                materials: { ...state.materials, [id]: material },
            });
        },
        replaceNode: (id, node) => {
            const state = get();
            if (!state.nodesById[id]) return;

            const parentId = state.parentIdById[id];
            const next = cloneGraphState(state);

            removeSubtreeFromGraph(id, state, next);
            insertSubtreeIntoGraph(node, parentId, next);

            const patch: Partial<PrefabState> = {
                nodesById: next.nodesById,
                childIdsById: next.childIdsById,
                parentIdById: next.parentIdById,
            };

            if (id === state.rootId) {
                patch.rootId = node.id;
            } else if (parentId) {
                next.childIdsById[parentId] = (next.childIdsById[parentId] ?? []).map(childId => childId === id ? node.id : childId);
            }

            set(patch);
        },
        addChild: (parentId, node) => {
            const state = get();
            if (!state.nodesById[parentId]) return;

            const next = cloneGraphState(state);

            insertSubtreeIntoGraph(node, parentId, next);
            next.childIdsById[parentId] = [...(next.childIdsById[parentId] ?? []), node.id];

            set({
                nodesById: next.nodesById,
                childIdsById: next.childIdsById,
                parentIdById: next.parentIdById,
            });
        },
        deleteNode: (id) => {
            const state = get();
            if (id === state.rootId || !state.nodesById[id]) return;

            const parentId = state.parentIdById[id];
            if (!parentId) return;

            const next = cloneGraphState(state);

            removeSubtreeFromGraph(id, state, next);
            next.childIdsById[parentId] = (next.childIdsById[parentId] ?? []).filter(childId => childId !== id);

            set({
                nodesById: next.nodesById,
                childIdsById: next.childIdsById,
                parentIdById: next.parentIdById,
            });
        },
        duplicateNode: (id) => {
            const state = get();
            if (id === state.rootId || !state.nodesById[id]) return null;

            const parentId = state.parentIdById[id];
            if (!parentId) return null;

            const nextNodesById = { ...state.nodesById };
            const nextChildIdsById = { ...state.childIdsById };
            const nextParentIdById = { ...state.parentIdById };
            const duplicatedRootId = cloneSubtree(id, parentId, state, nextNodesById, nextChildIdsById, nextParentIdById);

            if (!duplicatedRootId) return null;

            const siblings = [...(nextChildIdsById[parentId] ?? [])];
            const currentIndex = siblings.findIndex(childId => childId === id);
            if (currentIndex === -1) {
                siblings.push(duplicatedRootId);
            } else {
                siblings.splice(currentIndex + 1, 0, duplicatedRootId);
            }
            nextChildIdsById[parentId] = siblings;

            set({
                nodesById: nextNodesById,
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            });

            return duplicatedRootId;
        },
        moveNode: (draggedId, targetId, position) => {
            const state = get();
            if (draggedId === state.rootId || draggedId === targetId) return;
            if (!state.nodesById[draggedId] || !state.nodesById[targetId]) return;
            if (isDescendant(targetId, draggedId, state.parentIdById)) return;

            const currentParentId = state.parentIdById[draggedId];
            if (!currentParentId) return;

            const destinationParentId = position === "inside"
                ? targetId
                : state.parentIdById[targetId];
            if (!destinationParentId) return;
            if (destinationParentId === draggedId || isDescendant(destinationParentId, draggedId, state.parentIdById)) return;

            const nextChildIdsById = { ...state.childIdsById };
            const nextParentIdById = { ...state.parentIdById, [draggedId]: destinationParentId };
            const sourceChildren = [...(nextChildIdsById[currentParentId] ?? [])].filter(childId => childId !== draggedId);
            nextChildIdsById[currentParentId] = sourceChildren;

            if (position === "inside") {
                nextChildIdsById[destinationParentId] = [...(nextChildIdsById[destinationParentId] ?? []), draggedId];
            } else {
                const destinationChildren = destinationParentId === currentParentId
                    ? [...sourceChildren]
                    : [...(nextChildIdsById[destinationParentId] ?? [])];
                const targetIndex = destinationChildren.findIndex(childId => childId === targetId);
                if (targetIndex === -1) return;
                destinationChildren.splice(targetIndex, 0, draggedId);
                nextChildIdsById[destinationParentId] = destinationChildren;
            }

            set({
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            });
        },
    })));
}

export const prefabStoreToPrefab = denormalizePrefab;
