import { createContext, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PrefabChunkTiming } from 'react-three-game/viewer';

export const CityProfiling = createContext(false);

/** Aggregate activity so the console remains usable during a crossing. */
export function CityDebugLog() {
    const lastFrame = useRef(0);
    const peak = useRef({ startMs: 0, gapMs: 0 });
    useFrame(() => {
        const now = performance.now();
        const gap = now - lastFrame.current;
        if (lastFrame.current && gap > peak.current.gapMs) {
            peak.current = { startMs: lastFrame.current, gapMs: gap };
        }
        lastFrame.current = now;
    });
    useEffect(() => {
        let longestFrame = 0;
        let slowest: { tile: number; cell: string; readyMs: number } | undefined;
        const tiles = new Map<number, number>();
        const activations: { tile: number; elapsedMs: number }[] = [];
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === 'long-animation-frame') longestFrame = Math.max(longestFrame, entry.duration);
                if (entry.name === 'City tile: loading → active') {
                    activations.push({ tile: (entry as PerformanceMeasure).detail.tile, elapsedMs: Math.round(entry.duration) });
                }
                if (entry.name === 'City cell: admitted → ready') {
                    const { tile, cell } = (entry as PerformanceMeasure).detail;
                    tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
                    if (!slowest || entry.duration > slowest.readyMs) slowest = { tile, cell, readyMs: entry.duration };
                }
            }
        });
        const longFrames = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
        observer.observe({ entryTypes: longFrames ? ['measure', 'long-animation-frame'] : ['measure'] });
        const timer = window.setInterval(() => {
            const longestFrameGap = peak.current;
            peak.current = { startMs: 0, gapMs: 0 };
            if (!tiles.size && !activations.length && !longestFrame) return;
            console.info('[city-profile]', JSON.stringify({ timeMs: Math.round(performance.now()),
                longestFrameGap, cellsReadyByTile: Object.fromEntries(tiles), slowestCell: slowest, tileActivations: activations,
                longestLongFrameMs: longFrames ? Math.round(longestFrame) : null }));
            tiles.clear();
            activations.length = 0;
            slowest = undefined;
            longestFrame = 0;
        }, 1000);
        return () => {
            clearInterval(timer);
            observer.disconnect();
        };
    }, []);
    return null;
}

export function reportCityTiming(tile: number, timing: PrefabChunkTiming) {
    const detail = { tile, cell: timing.id };
    const { admittedAt, compilingAt, readyAt } = timing;
    performance.measure('City cell: mount + assets', { start: admittedAt, end: compilingAt, detail });
    performance.measure('City cell: shader warmup', { start: compilingAt, end: readyAt, detail });
    performance.measure('City cell: admitted → ready', { start: admittedAt, end: readyAt, detail });
}
