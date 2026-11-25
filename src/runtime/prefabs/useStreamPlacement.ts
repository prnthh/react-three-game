import { useStore, type RootStore } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { framePriority, subscribeFrame } from '../scene/frame.js';
import { SpatialStreamScheduler, type SpatialStreamPlacement } from './SpatialStreamScheduler.js';

function createAdmission(store: RootStore) {
    const queue = new SpatialStreamScheduler();
    let unsubscribe: (() => void) | undefined;
    function sync() {
        if (queue.hasPending) {
            unsubscribe ??= subscribeFrame(store, ({ camera }) => {
                queue.update(camera);
                if (!queue.hasPending) sync();
            }, framePriority.streamingAdmission);
        } else {
            unsubscribe?.();
            unsubscribe = undefined;
        }
    }
    return (placement: SpatialStreamPlacement) => {
        const unregister = queue.register(placement);
        sync();
        return () => { unregister(); sync(); };
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
