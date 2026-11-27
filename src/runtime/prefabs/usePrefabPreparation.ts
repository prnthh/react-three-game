import { startTransition, useEffect, useRef, useState } from 'react';
import type { PrefabInstanceProps } from './PrefabInstance.js';

/** Cancel superseded work and expose only the current request's result. */
export function usePrefabPreparation<T>(prepare: (signal: AbortSignal) => Promise<T>,
    phase: 'loading' | 'compiling', onStatus: PrefabInstanceProps['onStatus']) {
    const [result, setResult] = useState<{ prepare: typeof prepare; value: T }>();
    const report = useRef(onStatus);
    report.current = onStatus;
    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        report.current?.({ phase });
        void prepare(signal).then(value => {
            if (!signal.aborted) startTransition(() => setResult({ prepare, value }));
        }, error => {
            if (!signal.aborted) report.current?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [prepare, phase]);
    return result?.prepare === prepare ? result.value : undefined;
}
