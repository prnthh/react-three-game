import { createContext, useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { PrefabChunkTiming } from 'react-three-game/viewer';
import type { WebGPURenderer } from 'three/webgpu';
import { getChunkOcclusionStats, profileChunkOcclusion } from '../../../src/runtime/rendering/chunkOcclusion.js';

export const CityProfiling = createContext(false);

/** Aggregate activity so the console remains usable during a crossing. */
export function CityDebugLog() {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    useLayoutEffect(() => {
        const stopOcclusion = profileChunkOcclusion(renderer);
        const debug = renderer.debug as typeof renderer.debug & {
            onNodeBuilderCreated?: ((...args: unknown[]) => void) | null;
        };
        const previous = debug.onNodeBuilderCreated;
        let builds = 0, longestFrame = 0, warmupBuilds = 0, submitMs = 0;
        let peakGpu: { frameMs: number; draws: number; passes: Record<string, number> } | undefined;
        let slowest: { tile: string; cell: string; readyMs: number } | undefined;
        const tiles = new Map<string, number>();
        const countBuild = (...args: unknown[]) => { builds++; previous?.(...args); };
        if (previous !== undefined) debug.onNodeBuilderCreated = countBuild;
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (entry.name === 'City GPU frame') {
                    const { frameMs, draws, passes } = (entry as PerformanceMark).detail;
                    if (!peakGpu || frameMs > peakGpu.frameMs) peakGpu = { frameMs, draws, passes };
                }
                if (entry.entryType === 'long-animation-frame') longestFrame = Math.max(longestFrame, entry.duration);
                if (entry.name === 'City cell: admitted → ready') {
                    const { tile, cell } = (entry as PerformanceMeasure).detail;
                    tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
                    if (!slowest || entry.duration > slowest.readyMs) slowest = { tile, cell, readyMs: entry.duration };
                }
                if (entry.name === 'City cell: shader warmup') {
                    const detail = (entry as PerformanceMeasure).detail;
                    warmupBuilds += detail.nodeBuilds ?? 0;
                    submitMs += detail.submitMs ?? 0;
                }
            }
        });
        const longFrames = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
        observer.observe({ entryTypes: longFrames ? ['measure', 'mark', 'long-animation-frame'] : ['measure', 'mark'] });
        const timer = window.setInterval(() => {
            if (!tiles.size && !builds && !longestFrame && !peakGpu) return;
            console.info('[city-profile]', JSON.stringify({ timeMs: Math.round(performance.now()),
                cellsReadyByTile: Object.fromEntries(tiles), slowestCell: slowest, peakGpu,
                rendererNodeBuilds: previous === undefined ? null : builds, warmupNodeBuilds: previous === undefined ? null : warmupBuilds,
                warmupSubmitMs: Math.round(submitMs), longestLongFrameMs: longFrames ? Math.round(longestFrame) : null }));
            tiles.clear();
            slowest = undefined;
            peakGpu = undefined;
            builds = warmupBuilds = submitMs = longestFrame = 0;
        }, 1000);
        return () => {
            clearInterval(timer);
            observer.disconnect();
            stopOcclusion();
            if (debug.onNodeBuilderCreated === countBuild) debug.onNodeBuilderCreated = previous;
        };
    }, [renderer]);
    return null;
}

export function profileCityRenderer(renderer: WebGPURenderer) {
    const inspector = renderer.inspector;
    const backend = renderer.backend as unknown as { getTimestamp(uid: string): number; trackTimestamp: boolean };
    type Frame = { gpu: { uid: string; pass: string }[]; ao?: string; draws: number; occlusion?: ReturnType<typeof getChunkOcclusionStats> };
    let frames = new Map<number, Frame>();
    let resolving = false;
    inspector.beginRender = (uid, scene) => {
        const id = renderer.info.frame;
        let frame = frames.get(id);
        if (!frame) frames.set(id, frame = { gpu: [], draws: 0 });
        const name = scene.name;
        const pass = name.startsWith('Shadow Map') ? 'shadows' : name.startsWith('Bloom [') ? 'bloom' : name || 'scene';
        frame.gpu.push({ uid, pass });
        if (scene.name === 'AO' || scene.name === 'Contact AO') {
            frame.ao = uid;
            const occlusion = getChunkOcclusionStats(renderer);
            if (occlusion) frame.occlusion = { ...occlusion };
        }
        if (frames.size < 25 || resolving) return;
        // Resolve after this frame has submitted.
        resolving = true;
        queueMicrotask(() => {
            const complete = frames;
            frames = new Map();
            if (!backend.trackTimestamp) { resolving = false; return; }
            void renderer.resolveTimestampsAsync().then(() => {
                for (const [id, sample] of complete) {
                    if (!sample.ao) continue;
                    const passes: Record<string, number> = Object.create(null);
                    for (const { uid, pass } of sample.gpu) passes[pass] = (passes[pass] ?? 0) + (backend.getTimestamp(uid) || 0);
                    performance.mark('City GPU frame', { detail: {
                        frame: id, frameMs: Object.values(passes).reduce((sum, ms) => sum + ms, 0), passes,
                        aoMs: backend.getTimestamp(sample.ao),
                        draws: sample.draws,
                        ...sample.occlusion,
                    } });
                }
            }).finally(() => { resolving = false; });
        });
    };
    inspector.finishRender = () => {
        const frame = frames.get(renderer.info.frame);
        if (frame) frame.draws = renderer.info.render.drawCalls;
    };
}

export function reportCityTiming(tile: string, timing: PrefabChunkTiming) {
    if (timing.phase !== 'ready') return;
    const detail = { tile, cell: timing.id };
    const { admittedAt, compilingAt, readyAt, shaders } = timing;
    performance.measure('City cell: mount + assets', { start: admittedAt, end: compilingAt, detail });
    performance.measure('City cell: shader warmup', { start: compilingAt, end: readyAt, detail: { ...detail, ...shaders } });
    performance.measure('City cell: admitted → ready', { start: admittedAt, end: readyAt, detail });
}
