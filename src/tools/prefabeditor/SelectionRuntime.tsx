import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

type SelectionState = { selectedId: string | null };
const SelectionContext = createContext<StoreApi<SelectionState> | null>(null);
const EMPTY_SELECTION_STORE = createStore<SelectionState>(() => ({ selectedId: null }));

/** Keeps selection reactive without threading it through every scene node. */
export function SelectionRuntimeProvider({
    selectedId = null,
    children,
}: {
    selectedId?: string | null;
    children: ReactNode;
}) {
    const [store] = useState(() => createStore<SelectionState>(() => ({ selectedId })));

    useLayoutEffect(() => {
        if (store.getState().selectedId !== selectedId) {
            store.setState({ selectedId });
        }
    }, [selectedId, store]);

    return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}

export function useNodeSelected(nodeId: string) {
    const store = useContext(SelectionContext) ?? EMPTY_SELECTION_STORE;
    return useStore(store, state => state.selectedId === nodeId);
}
