import type { PrefabState } from './prefab';
import type { PrefabStoreApi } from './prefabStore';

/** Capture store edits, grouping synchronous actions into one undo step. */
export function createPrefabHistory(store: PrefabStoreApi, limit = 50) {
    let entries: PrefabState[] = [store.getState()];
    let index = 0;
    let enabled = true;
    let restoring = false;
    let pending: PrefabState | null = null;
    let snapshot = { canUndo: false, canRedo: false };
    const listeners = new Set<() => void>();
    const notify = () => {
        snapshot = { canUndo: index > 0, canRedo: index < entries.length - 1 };
        listeners.forEach(listener => listener());
    };
    const flush = () => {
        if (!pending) return;
        entries = [...entries.slice(0, index + 1), pending].slice(-limit);
        pending = null;
        index = entries.length - 1;
        notify();
    };
    const restore = (next: number) => {
        if (next < 0 || next >= entries.length) return;
        restoring = true;
        try { store.getState().restoreState(entries[next]); }
        finally { restoring = false; }
        index = next;
        notify();
    };
    return {
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        // Subscribe with the editor lifetime; mounting in Strict Mode is safe.
        connect() {
            return store.subscribe(state => {
                if (!enabled || restoring) return;
                if (!pending) queueMicrotask(flush);
                pending = state;
            });
        },
        setEnabled(value: boolean) { flush(); enabled = value; },
        clear() {
            pending = null;
            entries = [store.getState()];
            index = 0;
            notify();
        },
        undo() { flush(); restore(index - 1); },
        redo() { flush(); restore(index + 1); },
    };
}
