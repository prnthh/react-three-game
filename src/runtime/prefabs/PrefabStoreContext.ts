import { Fragment, createContext, createElement, type ReactNode, useContext } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { PrefabStoreApi, PrefabStoreState } from "../../core/prefabStore.js";

const PrefabStoreContext = createContext<PrefabStoreApi | null>(null);
const EMPTY_CHILD_IDS: string[] = [];

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

