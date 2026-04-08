import { createContext, createElement, type ReactNode, useContext } from "react";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { GameObject, Prefab } from "./types";

export type PrefabNodeRecord = Omit<GameObject, "children">;

type PrefabAssetRefCounts = Record<string, number>;

type PrefabDocumentSnapshot = {
    prefabId?: string;
    prefabName?: string;
    rootId: string;
    nodesById: Record<string, PrefabNodeRecord>;
    childIdsById: Record<string, string[]>;
    parentIdById: Record<string, string | null>;
    revision: number;
    assetManifestKey: string;
    assetRefCounts: PrefabAssetRefCounts;
};

export interface PrefabStoreState extends PrefabDocumentSnapshot {
    replacePrefab: (prefab: Prefab) => void;
    updateNode: (id: string, update: (node: PrefabNodeRecord) => PrefabNodeRecord) => void;
    updateNodes: (updates: Array<{ id: string; update: (node: PrefabNodeRecord) => PrefabNodeRecord }>) => void;
    addChild: (parentId: string, node: GameObject) => void;
    deleteNode: (id: string) => void;
    duplicateNode: (id: string) => string | null;
    toggleNodeFlag: (id: string, key: "disabled" | "locked") => void;
    moveNode: (draggedId: string, targetId: string, position: "before" | "inside") => void;
}

export type PrefabStoreApi = StoreApi<PrefabStoreState>;

const PrefabStoreContext = createContext<PrefabStoreApi | null>(null);
const EMPTY_CHILD_IDS: string[] = [];

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
        ...createDocumentState(prefab),
        replacePrefab: (nextPrefab) => {
            set(createDocumentState(nextPrefab, get().revision + 1));
        },
        updateNode: (id, update) => {
            const state = get();
            const node = state.nodesById[id];
            if (!node) return;

            const nextNode = update(node);
            if (nextNode === node) return;

            const nextAssetRefCounts = updateAssetRefsForNodeChange(state.assetRefCounts, node, nextNode);

            set(createMutationPatch(state, {
                nodesById: { ...state.nodesById, [id]: nextNode },
            }, nextAssetRefCounts));
        },
        updateNodes: (updates) => {
            if (updates.length === 0) return;

            const state = get();
            let nextNodesById: Record<string, PrefabNodeRecord> | null = null;
            let nextAssetRefCounts = state.assetRefCounts;

            for (const { id, update } of updates) {
                const currentNode = (nextNodesById ?? state.nodesById)[id];
                if (!currentNode) continue;

                const nextNode = update(currentNode);
                if (nextNode === currentNode) continue;

                nextNodesById ??= { ...state.nodesById };
                nextNodesById[id] = nextNode;
                nextAssetRefCounts = updateAssetRefsForNodeChange(nextAssetRefCounts, currentNode, nextNode);
            }

            if (!nextNodesById) return;

            set(createMutationPatch(state, { nodesById: nextNodesById }, nextAssetRefCounts));
        },
        addChild: (parentId, node) => {
            const state = get();
            if (!state.nodesById[parentId]) return;

            const nextNodesById = { ...state.nodesById };
            const nextChildIdsById = { ...state.childIdsById };
            const nextParentIdById = { ...state.parentIdById };
            const nextAssetRefCounts = { ...state.assetRefCounts };

            insertSubtree(node, parentId, nextNodesById, nextChildIdsById, nextParentIdById);
            nextChildIdsById[parentId] = [...(nextChildIdsById[parentId] ?? []), node.id];
            addAssetRefs(nextAssetRefCounts, collectSubtreeAssetRefs(node));

            set(createMutationPatch(state, {
                nodesById: nextNodesById,
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            }, nextAssetRefCounts));
        },
        deleteNode: (id) => {
            const state = get();
            if (id === state.rootId || !state.nodesById[id]) return;

            const parentId = state.parentIdById[id];
            if (!parentId) return;

            const idsToDelete = collectSubtreeIds(id, state.childIdsById);
            const nextNodesById = { ...state.nodesById };
            const nextChildIdsById = { ...state.childIdsById };
            const nextParentIdById = { ...state.parentIdById };
            const nextAssetRefCounts = { ...state.assetRefCounts };

            removeAssetRefs(nextAssetRefCounts, collectAssetRefsForIds(idsToDelete, state.nodesById));

            idsToDelete.forEach(nodeId => {
                delete nextNodesById[nodeId];
                delete nextChildIdsById[nodeId];
                delete nextParentIdById[nodeId];
            });

            nextChildIdsById[parentId] = (nextChildIdsById[parentId] ?? []).filter(childId => childId !== id);

            set(createMutationPatch(state, {
                nodesById: nextNodesById,
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            }, nextAssetRefCounts));
        },
        duplicateNode: (id) => {
            const state = get();
            if (id === state.rootId || !state.nodesById[id]) return null;

            const parentId = state.parentIdById[id];
            if (!parentId) return null;

            const nextNodesById = { ...state.nodesById };
            const nextChildIdsById = { ...state.childIdsById };
            const nextParentIdById = { ...state.parentIdById };
            const duplicatedRootId = cloneSubtreeIntoMaps(id, parentId, state, nextNodesById, nextChildIdsById, nextParentIdById);

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

            set(createMutationPatch(state, {
                nodesById: nextNodesById,
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            }, nextAssetRefCounts));

            return duplicatedRootId;
        },
        toggleNodeFlag: (id, key) => {
            const state = get();
            const node = state.nodesById[id];
            if (!node) return;

            const nextNode = { ...node, [key]: !node[key] };
            set(createMutationPatch(state, {
                nodesById: { ...state.nodesById, [id]: nextNode },
            }));
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

            set(createMutationPatch(state, {
                childIdsById: nextChildIdsById,
                parentIdById: nextParentIdById,
            }));
        },
    })));
}

export function prefabStoreToPrefab(state: Pick<PrefabDocumentSnapshot, "prefabId" | "prefabName" | "rootId" | "nodesById" | "childIdsById">): Prefab {
    return {
        id: state.prefabId,
        name: state.prefabName,
        root: denormalizeNode(state.rootId, state.nodesById, state.childIdsById),
    };
}

function createDocumentState(prefab: Prefab, revision = 0): PrefabDocumentSnapshot {
    const nodesById: Record<string, PrefabNodeRecord> = {};
    const childIdsById: Record<string, string[]> = {};
    const parentIdById: Record<string, string | null> = {};

    insertSubtree(prefab.root, null, nodesById, childIdsById, parentIdById);

    const assetRefCounts = createAssetRefCounts(nodesById);

    return {
        prefabId: prefab.id,
        prefabName: prefab.name,
        rootId: prefab.root.id,
        nodesById,
        childIdsById,
        parentIdById,
        revision,
        assetManifestKey: getAssetManifestKey(assetRefCounts),
        assetRefCounts,
    };
}

function createMutationPatch(
    state: PrefabDocumentSnapshot,
    patch: Partial<PrefabDocumentSnapshot>,
    nextAssetRefCounts = state.assetRefCounts,
): Partial<PrefabDocumentSnapshot> {
    const assetRefsChanged = nextAssetRefCounts !== state.assetRefCounts;

    return {
        ...patch,
        revision: state.revision + 1,
        ...(assetRefsChanged ? {
            assetRefCounts: nextAssetRefCounts,
            assetManifestKey: getAssetManifestKey(nextAssetRefCounts),
        } : null),
    };
}

function denormalizeNode(
    id: string,
    nodesById: Record<string, PrefabNodeRecord>,
    childIdsById: Record<string, string[]>,
): GameObject {
    const node = nodesById[id];
    return {
        ...node,
        children: (childIdsById[id] ?? []).map(childId => denormalizeNode(childId, nodesById, childIdsById)),
    };
}

function collectSubtreeIds(id: string, childIdsById: Record<string, string[]>) {
    const ids = [id];

    for (const childId of childIdsById[id] ?? []) {
        ids.push(...collectSubtreeIds(childId, childIdsById));
    }

    return ids;
}

function insertSubtree(
    node: GameObject,
    parentId: string | null,
    nodesById: Record<string, PrefabNodeRecord>,
    childIdsById: Record<string, string[]>,
    parentIdById: Record<string, string | null>,
) {
    const { children, ...nodeRecord } = node;
    nodesById[node.id] = nodeRecord;
    childIdsById[node.id] = children?.map(child => child.id) ?? [];
    parentIdById[node.id] = parentId;

    children?.forEach(child => insertSubtree(child, node.id, nodesById, childIdsById, parentIdById));
}

function cloneSubtreeIntoMaps(
    id: string,
    parentId: string | null,
    source: Pick<PrefabDocumentSnapshot, "nodesById" | "childIdsById">,
    nodesById: Record<string, PrefabNodeRecord>,
    childIdsById: Record<string, string[]>,
    parentIdById: Record<string, string | null>,
): string | null {
    const originalNode = source.nodesById[id];
    if (!originalNode) return null;

    const clonedId = crypto.randomUUID();
    const clonedNode: PrefabNodeRecord = {
        ...originalNode,
        id: clonedId,
        name: `${originalNode.name ?? originalNode.id} Copy`,
    };

    nodesById[clonedId] = clonedNode;
    parentIdById[clonedId] = parentId;

    const clonedChildIds = (source.childIdsById[id] ?? [])
        .map(childId => cloneSubtreeIntoMaps(childId, clonedId, source, nodesById, childIdsById, parentIdById))
        .filter((childId): childId is string => Boolean(childId));

    childIdsById[clonedId] = clonedChildIds;
    return clonedId;
}

function isDescendant(id: string, potentialAncestorId: string, parentIdById: Record<string, string | null>) {
    let currentId: string | null | undefined = id;

    while (currentId) {
        if (currentId === potentialAncestorId) return true;
        currentId = parentIdById[currentId];
    }

    return false;
}

function createAssetRefCounts(nodesById: Record<string, PrefabNodeRecord>) {
    const assetRefCounts: PrefabAssetRefCounts = {};
    Object.values(nodesById).forEach(node => addAssetRefs(assetRefCounts, getAssetRefs(node)));
    return assetRefCounts;
}

function updateAssetRefsForNodeChange(
    assetRefCounts: PrefabAssetRefCounts,
    currentNode: PrefabNodeRecord,
    nextNode: PrefabNodeRecord,
) {
    const currentRefs = getAssetRefs(currentNode);
    const nextRefs = getAssetRefs(nextNode);

    if (sameStringArrays(currentRefs, nextRefs)) {
        return assetRefCounts;
    }

    const nextAssetRefCounts = { ...assetRefCounts };
    removeAssetRefs(nextAssetRefCounts, currentRefs);
    addAssetRefs(nextAssetRefCounts, nextRefs);
    return nextAssetRefCounts;
}

function collectSubtreeAssetRefs(node: GameObject): string[] {
    const refs = getAssetRefs(node);
    node.children?.forEach(child => refs.push(...collectSubtreeAssetRefs(child)));
    return refs;
}

function collectAssetRefsForIds(ids: string[], nodesById: Record<string, PrefabNodeRecord>) {
    return ids.flatMap(id => getAssetRefs(nodesById[id]));
}

function getAssetRefs(node?: Pick<GameObject, "components"> | null) {
    const refs: string[] = [];

    Object.values(node?.components ?? {}).forEach(component => {
        if (!component?.type) return;

        if (component.type === "Model" && component.properties?.filename) {
            refs.push(`model:${component.properties.filename}`);
        }

        if (component.type === "Material") {
            if (component.properties?.texture) refs.push(`texture:${component.properties.texture}`);
            if (component.properties?.normalMapTexture) refs.push(`texture:${component.properties.normalMapTexture}`);
        }

        if (component.type === "SpotLight" && component.properties?.map) {
            refs.push(`texture:${component.properties.map}`);
        }
    });

    return refs.sort();
}

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

function getAssetManifestKey(assetRefCounts: PrefabAssetRefCounts) {
    return Object.keys(assetRefCounts).sort().join("|");
}

function sameStringArrays(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}
