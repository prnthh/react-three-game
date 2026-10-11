import { createContext, startTransition, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';

import { useThree } from '@react-three/fiber';
import { Vector3, type Camera, type Object3D } from 'three';

/** Nearest committed host, including streamed prefab placement transforms. */
export const MountParentContext = createContext<RefObject<Object3D | null> | null>(null);

type MountTask = { activate: () => void; priority: () => number; distance: number };

/** Select a bounded batch without sorting the entire queue. Ties retain arrival order. */
function nearestTasks(waiting: Set<MountTask>, limit: number) {
    const batch: MountTask[] = [];
    for (const task of waiting) {
        const distance = task.priority();
        task.distance = Number.isFinite(distance) ? distance : Infinity;
        const before = batch.findIndex(other => task.distance < other.distance);
        const index = before < 0 ? batch.length : before;
        if (index >= limit) continue;
        batch.splice(index, 0, task);
        if (batch.length > limit) batch.pop();
    }
    return batch;
}

/** One canvas-wide budget. A new batch waits until the previous batch commits. */
export class MountQueue {
    lifetime: object | null = null;
    private waiting = new Set<MountTask>();
    private mounting = new Set<MountTask>();
    private frame: number | null = null;
    constructor(private batchSize: number, private schedule = (callback: FrameRequestCallback) => requestAnimationFrame(callback), private cancel = (id: number) => cancelAnimationFrame(id)) {}
    getSnapshot = () => this.waiting.size + this.mounting.size > 0;

    enqueue(activate: () => void, priority = () => 0) {
        const task = { activate, priority, distance: 0 };
        this.waiting.add(task);
        this.scheduleFrame();
        // The same cleanup cancels waiting work or acknowledges a committed mount.
        return () => {
            this.waiting.delete(task);
            this.mounting.delete(task);
            this.scheduleFrame();
        };
    }

    private scheduleFrame() {
        if (this.frame === null && this.waiting.size && !this.mounting.size) {
            this.frame = this.schedule(this.flush);
        }
    }

    private flush = () => {
        this.frame = null;
        const batch = nearestTasks(this.waiting, this.batchSize);
        for (const task of batch) {
            this.waiting.delete(task);
            this.mounting.add(task);
        }
        startTransition(() => { for (const task of batch) task.activate(); });
    };

    dispose() {
        if (this.frame !== null) this.cancel(this.frame);
        this.frame = null;
        this.waiting.clear();
        this.mounting.clear();
    }
}

const MountContext = createContext<{ queue: MountQueue | null; getCamera: () => Camera } | null>(null);

/** Readiness belongs to a prefab subtree; unrelated placements share only the frame budget. */
export class PrefabMountScope {
    private pending = 1;
    private committed = false;
    private listeners = new Set<() => void>();
    constructor(private parent: PrefabMountScope | null = null) {}
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getSnapshot = () => this.pending > 0;
    private changed() { this.listeners.forEach(listener => listener()); }
    commit() {
        if (this.committed) return;
        this.committed = true;
        this.pending--;
        this.changed();
    }
    begin() {
        const releaseParent = this.parent?.begin();
        this.pending++;
        this.changed();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.pending--;
            this.changed();
            releaseParent?.();
        };
    }
}

export const PrefabMountContext = createContext<PrefabMountScope | null>(null);

export function ProgressiveMountProvider({ batchSize, children }: { batchSize: number; children: ReactNode }) {
    const get = useThree(state => state.get);
    const queue = useMemo(() => Number.isFinite(batchSize) && batchSize > 0 ? new MountQueue(Math.max(1, Math.floor(batchSize))) : null, [batchSize]);
    useEffect(() => {
        const token = {};
        if (queue) queue.lifetime = token;
        return () => { queueMicrotask(() => { if (queue?.lifetime === token) queue.dispose(); }); };
    }, [queue]);
    const value = useMemo(() => ({ queue, getCamera: () => get().camera }), [queue, get]);
    return <MountContext.Provider value={value}>{children}</MountContext.Provider>;
}

export function useProgressiveMount(defer: boolean, position: readonly [number, number, number] = [0, 0, 0]) {
    const context = useContext(MountContext);
    const queue = context?.queue;
    const parent = useContext(MountParentContext);
    const scope = useContext(PrefabMountContext);
    const [admitted, setAdmitted] = useState(false);
    const ready = !queue || !defer || admitted;
    const [x, y, z] = position;
    // Admission remains pending until its React commit, including any nested gates.
    useLayoutEffect(() => {
        if (ready || !queue || !context) return;
        const point = new Vector3(), cameraPosition = new Vector3();
        const release = scope?.begin();
        const acknowledge = queue.enqueue(() => setAdmitted(true), () => {
            point.set(x, y, z);
            parent?.current?.localToWorld(point);
            context.getCamera().getWorldPosition(cameraPosition);
            return point.distanceToSquared(cameraPosition);
        });
        return () => { acknowledge(); release?.(); };
    }, [queue, ready, parent, context, scope, x, y, z]);
    return ready;
}

const noSubscribe = () => () => {};
const noPending = () => false;
/** Internal readiness signal, including nested prefab roots. */
export function usePrefabMountPending(enabled = true) {
    const scope = useContext(PrefabMountContext);
    const mounting = useContext(MountContext)?.queue && enabled ? scope : null;
    return useSyncExternalStore(mounting ? mounting.subscribe : noSubscribe,
        mounting ? mounting.getSnapshot : noPending, noPending);
}
