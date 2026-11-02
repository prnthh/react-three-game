import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';

type Admission = { enqueue(mount: () => void): () => void };
const MountBudgetContext = createContext<Admission | null>(null);
export const useHasNodeMountBudget = () => useContext(MountBudgetContext) !== null;

/** Spread initial authoring-tree mounts across frames. Nodes keep the original
 * editor store, IDs and selection; already admitted nodes never remount on edits. */
export function NodeMountBudget({ children, nodesPerFrame = 48 }: { children: ReactNode; nodesPerFrame?: number }) {
    const queue = useMemo(() => new Set<() => void>(), []);
    const enqueue = useCallback((mount: () => void) => {
        queue.add(mount);
        return () => { queue.delete(mount); };
    }, [queue]);
    const admission = useMemo(() => ({ enqueue }), [enqueue]);
    useFrame(() => {
        let remaining = Math.max(1, Math.floor(nodesPerFrame));
        for (const mount of queue) {
            queue.delete(mount);
            mount();
            if (--remaining === 0) break;
        }
    }, -50);
    return <MountBudgetContext.Provider value={admission}>{children}</MountBudgetContext.Provider>;
}

export function useNodeMountAdmission(enabled = true) {
    const budget = useContext(MountBudgetContext);
    const [admitted, setAdmitted] = useState(!budget);
    useEffect(() => {
        if (admitted || !budget || !enabled) return;
        return budget.enqueue(() => setAdmitted(true));
    }, [budget, admitted, enabled]);
    return admitted || !budget || !enabled;
}
