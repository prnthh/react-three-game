import { createContext, createElement, useEffect, useMemo } from 'react';
import { DemoDebugLog } from './DemoDebugLog';
import type { PrefabChunkTiming } from 'react-three-game/viewer';

export const CityProfiling = createContext(false);

export function CityDebugLog() {
    const activity = useMemo(() => {
        const tiles = new Map<number, number>();
        const activations: { tile: number; elapsedMs: number }[] = [];
        let slowest: { tile: number; cell: string; readyMs: number } | undefined;
        return {
            record(entry: PerformanceMeasure) {
                if (entry.name === 'City tile: loading → active') {
                    activations.push({ tile: entry.detail.tile, elapsedMs: Math.round(entry.duration) });
                }
                if (entry.name === 'City cell: admitted → ready') {
                    const { tile, cell } = entry.detail;
                    tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
                    if (!slowest || entry.duration > slowest.readyMs) slowest = { tile, cell, readyMs: entry.duration };
                }
            },
            read() {
                if (!tiles.size && !activations.length) return null;
                const details = { cellsReadyByTile: Object.fromEntries(tiles), slowestCell: slowest, tileActivations: activations.splice(0) };
                tiles.clear();
                slowest = undefined;
                return details;
            },
        };
    }, []);
    useEffect(() => {
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) activity.record(entry as PerformanceMeasure);
        });
        observer.observe({ type: 'measure' });
        return () => observer.disconnect();
    }, [activity]);
    return createElement(DemoDebugLog, { demo: 'city', readDetails: activity.read });
}

export function reportCityTiming(tile: number, timing: PrefabChunkTiming) {
    const detail = { tile, cell: timing.id };
    const { admittedAt, compilingAt, readyAt } = timing;
    performance.measure('City cell: mount + assets', { start: admittedAt, end: compilingAt, detail });
    performance.measure('City cell: shader warmup', { start: compilingAt, end: readyAt, detail });
    performance.measure('City cell: admitted → ready', { start: admittedAt, end: readyAt, detail });
}
