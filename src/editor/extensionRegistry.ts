/** Reactive extension catalog. Cleanup belongs to a registration, not its value. */
export function createExtensionRegistry<T extends { id: string }>() {
    const entries = new Map<string, { value: T }>();
    let snapshot: readonly T[] = [];
    const listeners = new Set<() => void>();
    const notify = () => {
        snapshot = Object.freeze([...entries.values()].map(entry => entry.value));
        for (const listener of [...listeners]) listener();
    };
    return {
        get: (id: string) => entries.get(id)?.value,
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        register(value: T) {
            const entry = { value };
            entries.set(value.id, entry);
            notify();
            return () => {
                if (entries.get(value.id) !== entry) return;
                entries.delete(value.id);
                notify();
            };
        },
    };
}
