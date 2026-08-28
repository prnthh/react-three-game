import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

type SelectionState = { selectedId: string | null };
type SelectionHandler = (nodeId: string | null) => void;
const SelectionContext = createContext<StoreApi<SelectionState> | null>(null);
const EditSelectionContext = createContext<SelectionHandler | null>(null);
const EMPTY_SELECTION_STORE = createStore<SelectionState>(() => ({ selectedId: null }));

/** Keeps selection reactive without threading it through every scene node. */
export function SelectionRuntimeProvider({
    selectedId = null,
    select,
    children,
}: {
    selectedId?: string | null;
    select?: SelectionHandler;
    children: ReactNode;
}) {
    const inheritedSelection = useContext(EditSelectionContext);
    const [store] = useState(() => createStore<SelectionState>(() => ({ selectedId })));

    useLayoutEffect(() => {
        if (store.getState().selectedId !== selectedId) {
            store.setState({ selectedId });
        }
    }, [selectedId, store]);

    return (
        <SelectionContext.Provider value={store}>
            <EditSelectionContext.Provider value={select ?? inheritedSelection}>{children}</EditSelectionContext.Provider>
        </SelectionContext.Provider>
    );
}

export function useNodeSelected(nodeId: string) {
    const store = useContext(SelectionContext) ?? EMPTY_SELECTION_STORE;
    return useStore(store, state => state.selectedId === nodeId);
}

export function useEditSelection() {
    return useContext(EditSelectionContext);
}
