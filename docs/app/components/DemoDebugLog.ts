import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export function demoDebugEnabled() {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
}

/** One sample per rendered frame, one console record per active second. */
export function DemoDebugLog({ demo, readDetails }: { demo: string; readDetails?: () => object | null }) {
    const previous = useRef(0);
    const gaps = useRef<number[]>([]);
    const peak = useRef({ startMs: 0, gapMs: 0 });
    useFrame(() => {
        const now = performance.now();
        if (previous.current) {
            const gap = now - previous.current;
            gaps.current.push(gap);
            if (gap > peak.current.gapMs) peak.current = { startMs: previous.current, gapMs: gap };
        }
        previous.current = now;
    });
    useEffect(() => {
        let longest = 0;
        const supported = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
        });
        if (supported) observer.observe({ type: 'long-animation-frame' });
        const timer = window.setInterval(() => {
            const frames = gaps.current.splice(0).sort((a, b) => a - b);
            const longestFrameGap = peak.current;
            peak.current = { startMs: 0, gapMs: 0 };
            const details = readDetails?.();
            if ((frames.length && details !== null) || longest) {
                console.info(`[${demo}-profile]`, JSON.stringify({ timeMs: Math.round(performance.now()),
                    frameIntervals: frames.length, frameP95Ms: frames[Math.ceil(frames.length * 0.95) - 1],
                    longestFrameGap, longestLongFrameMs: supported ? Math.round(longest) : null, ...details }));
            }
            longest = 0;
        }, 1000);
        return () => { clearInterval(timer); observer.disconnect(); };
    }, [demo, readDetails]);
    return null;
}
