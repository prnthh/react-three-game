import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";

type SelectionState = { selectedId: string | null };
type SelectionHandler = (nodeId: string | null) => void;
const SelectionContext = createContext<StoreApi<SelectionState> | null>(null);
const EditSelectionContext = createContext<SelectionHandler | null>(null);
const EMPTY_SELECTION_STORE = createStore<SelectionState>(() => ({ selectedId: null }));
const EMPTY_SUBSCRIBE = () => () => {};
const FALSE_SNAPSHOT = () => false;

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

export function useNodeSelected(nodeId: string, enabled = true) {
    const store = useContext(SelectionContext) ?? EMPTY_SELECTION_STORE;
    return useSyncExternalStore(
        enabled ? store.subscribe : EMPTY_SUBSCRIBE,
        enabled ? () => store.getState().selectedId === nodeId : FALSE_SNAPSHOT,
        FALSE_SNAPSHOT,
    );
}

export function useEditSelection() {
    return useContext(EditSelectionContext);
}
