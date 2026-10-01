import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Admit a bounded amount of node construction between paints. */
export function createNodeMountQueue(schedule: (run: () => void) => number, cancel: (id: number) => void, batchSize = 8) {
    const pending = new Set<() => void>();
    let frame: number | undefined;
    const flush = () => {
        frame = undefined;
        const batch = [...pending].slice(0, batchSize);
        for (const mount of batch) {
            pending.delete(mount);
            mount();
        }
        if (pending.size) frame = schedule(flush);
    };
    return {
        enqueue(mount: () => void) {
            pending.add(mount);
            if (frame === undefined) frame = schedule(flush);
            return () => {
                pending.delete(mount);
                if (!pending.size && frame !== undefined) {
                    cancel(frame);
                    frame = undefined;
                }
            };
        },
    };
}

const NodeMountContext = createContext<ReturnType<typeof createNodeMountQueue> | null>(null);

/** Only authoring streams construction; gameplay and prepared viewers mount normally. */
export function EditorNodeStreaming({ enabled, children }: { enabled: boolean; children: ReactNode }) {
    const [queue] = useState(() => createNodeMountQueue(run => requestAnimationFrame(run), id => cancelAnimationFrame(id)));
    return <NodeMountContext.Provider value={enabled ? queue : null}>{children}</NodeMountContext.Provider>;
}

export function useNodeMountReady() {
    const queue = useContext(NodeMountContext);
    const [ready, setReady] = useState(() => !queue);
    useEffect(() => {
        if (ready) return;
        if (!queue) {
            setReady(true);
            return;
        }
        return queue.enqueue(() => setReady(true));
    }, [queue, ready]);
    return ready || !queue;
}
