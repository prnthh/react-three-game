import { useStore, type RootStore } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { framePriority, subscribeFrame } from '../scene/frame.js';
import { SpatialStreamScheduler, type SpatialStreamPlacement } from './SpatialStreamScheduler.js';

function createAdmission(store: RootStore) {
    const queue = new SpatialStreamScheduler();
    let unsubscribe: (() => void) | undefined;
    function stopIfIdle() {
        if (queue.hasPending) return;
        unsubscribe?.();
        unsubscribe = undefined;
    }
    return (placement: SpatialStreamPlacement) => {
        const unregister = queue.register(placement);
        if (queue.hasPending) {
            unsubscribe ??= subscribeFrame(store, ({ camera }) => {
                queue.update(camera);
                stopIfIdle();
            }, framePriority.streamingAdmission);
        }
        return () => { unregister(); stopIfIdle(); };
    };
}

const admissions = new WeakMap<RootStore, ReturnType<typeof createAdmission>>();

export function useStreamPlacement(placement: SpatialStreamPlacement) {
    const store = useStore();
    useLayoutEffect(() => {
        let register = admissions.get(store);
        if (!register) admissions.set(store, register = createAdmission(store));
        return register(placement);
    }, [placement, store]);
}
