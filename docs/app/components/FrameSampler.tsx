import { useEffect, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';

export interface FrameSample { time: number; cpu: number; gpu?: number }

export function FrameSampler({ onSample, benchmark }: { onSample(sample: FrameSample): void; benchmark: boolean }) {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    const begin = useRef<(() => void) | null>(null);
    useFrame(() => begin.current?.(), -Infinity);

    useEffect(() => {
        const backend = renderer.backend as typeof renderer.backend & { trackTimestamp: boolean };
        const previous = backend.trackTimestamp;
        const supported = renderer.hasFeature('timestamp-query');
        let active = true, pending = false, next = 0;
        let start: number | undefined;
        begin.current = () => {
            const now = performance.now();
            if (now < next || pending) return;
            start = now;
            if (supported && !benchmark) backend.trackTimestamp = true;
        };
        const unsubscribe = addAfterEffect(() => {
            if (start === undefined) return;
            const time = performance.now(), cpu = time - start;
            start = undefined;
            next = time + 250;
            if (!supported || benchmark) {
                // The benchmark already resolves the same GPU query pool.
                onSample({ time, cpu, gpu: supported && renderer.info.render.timestamp > 0 ? renderer.info.render.timestamp : undefined });
                return;
            }
            pending = true;
            void renderer.resolveTimestampsAsync().then(gpu => {
                if (active) onSample({ time, cpu, gpu });
            }, () => { if (active) onSample({ time, cpu }); }).finally(() => { pending = false; });
            backend.trackTimestamp = previous;
        });
        return () => { active = false; begin.current = null; unsubscribe(); backend.trackTimestamp = previous; };
    }, [renderer, onSample, benchmark]);
    return null;
}
