import { createContext, createElement, type ReactNode, useContext } from "react";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { GameObject, Prefab } from "./types";
import {
    collectAssetRefsForIds,
    collectSubtreeAssetRefs,
    collectSubtreeIds,
    cloneSubtree,
    createPrefabPatch,
    denormalizePrefab,
    insertSubtree,
    isDescendant,
    normalizePrefab,
    PrefabState,
    PrefabAssetRefCounts,
    PrefabNodeRecord,
    updateAssetRefsForNodeChange,
} from "./prefab";

export interface PrefabStoreState extends PrefabState {
    replacePrefab: (prefab: Prefab) => void;
    updateNode: (id: string, update: (node: PrefabNodeRecord) => PrefabNodeRecord) => void;
    replaceNode: (id: string, node: GameObject) => void;
    addChild: (parentId: string, node: GameObject) => void;
    deleteNode: (id: string) => void;
    duplicateNode: (id: string) => string | null;
    moveNode: (draggedId: string, targetId: string, position: "before" | "inside") => void;
}

export type PrefabStoreApi = StoreApi<PrefabStoreState>;

const PrefabStoreContext = createContext<PrefabStoreApi | null>(null);
const EMPTY_CHILD_IDS: string[] = [];

function addAssetRefs(assetRefCounts: PrefabAssetRefCounts, refs: string[]) {
    refs.forEach(ref => {
        assetRefCounts[ref] = (assetRefCounts[ref] ?? 0) + 1;
    });
}

function removeAssetRefs(assetRefCounts: PrefabAssetRefCounts, refs: string[]) {
    refs.forEach(ref => {
        const nextCount = (assetRefCounts[ref] ?? 0) - 1;
        if (nextCount > 0) {
            assetRefCounts[ref] = nextCount;
            return;
        }

        delete assetRefCounts[ref];
    });
}

function cloneGraphState(state: PrefabStoreState) {
    return {
        nodesById: { ...state.nodesById },
        childIdsById: { ...state.childIdsById },
        parentIdById: { ...state.parentIdById },
        assetRefCounts: { ...state.assetRefCounts },
    };
}

function removeSubtreeFromGraph(
    id: string,
    state: PrefabStoreState,
    next: ReturnType<typeof cloneGraphState>,
) {
    const ids = collectSubtreeIds(id, state.childIdsById);

    removeAssetRefs(next.assetRefCounts, collectAssetRefsForIds(ids, state.nodesById));

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
    addAssetRefs(next.assetRefCounts, collectSubtreeAssetRefs(node));
}

export function PrefabStoreProvider({
    store,
    children,
}: {
    store: PrefabStoreApi;
    children: ReactNode;
}) {
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

export function createPrefabStore(prefab: Prefab): PrefabStoreApi {
    return createStore<PrefabStoreState>()(subscribeWithSelector((set, get) => ({
        ...normalizePrefab(prefab),
        replacePrefab: (nextPrefab) => {
            set(normalizePrefab(nextPrefab));
        },
        updateNode: (id, update) => {
            const state = get();
            const node = state.nodesById[id];
            if (!node) return;

            const nextNode = update(node);
            if (nextNode === node) return;

            const nextAssetRefCounts = updateAssetRefsForNodeChange(state.assetRefCounts, node, nextNode);

            set(createPrefabPatch(state, {
                nodesById: { ...state.nodesById, [id]: nextNode },
            }, nextAssetRefCounts));
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

            set(createPrefabPatch(state, patch, next.assetRefCounts));
        },
        addChild: (parentId, node) => {
            const state = get();
            if (!state.nodesById[parentId]) return;

            const next = cloneGraphState(state);

            insertSubtreeIntoGraph(node, parentId, next);
            next.childIdsById[parentId] = [...(next.childIdsById[parentId] ?? []), node.id];

            set(createPrefabPatch(state, {
                nodesById: next.nodesById,
                childIdsById: next.childIdsById,
                parentIdById: next.parentIdById,
            }, next.assetRefCounts));
        },
        deleteNode: (id) => {
            const state = get();
            if (id === state.rootId || !state.nodesById[id]) return;

            const parentId = state.parentIdById[id];
            if (!parentId) return;

            const next = cloneGraphState(state);

            removeSubtreeFromGraph(id, state, next);
            next.childIdsById[parentId] = (next.childIdsById[parentId] ?? []).filter(childId => childId !== id);

            set(createPrefabPatch(state, {
                nodesById: next.nodesById,
                childIdsById: next.childIdsById,
                parentIdById: next.parentIdById,
            }, next.assetRefCounts));
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

            const nextAssetRefCounts = { ...state.assetRefCounts };
            addAssetRefs(nextAssetRefCounts, collectAssetRefsForIds(collectSubtreeIds(id, state.childIdsById), state.nodesById));

            set(createPrefabPatch(state, {
                nodesById: nextNodesById,
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            }, nextAssetRefCounts));

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

            set(createPrefabPatch(state, {
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            }));
        },
    })));
}

export const prefabStoreToPrefab = denormalizePrefab;
