import { createContext } from 'react';
import type { PrefabChunkTiming } from 'react-three-game/viewer';
import type { WebGPURenderer } from 'three/webgpu';
import { getChunkOcclusionStats } from '../../../src/runtime/rendering/chunkOcclusion.js';

export const CityProfiling = createContext(false);

export function profileCityRenderer(renderer: WebGPURenderer) {
    const inspector = renderer.inspector;
    const backend = renderer.backend as unknown as { getTimestamp(uid: string): number; trackTimestamp: boolean };
    type Frame = { gpu: string[]; ao?: string; draws: number; occlusion?: ReturnType<typeof getChunkOcclusionStats> };
    let frames = new Map<number, Frame>();
    let resolving = false;
    inspector.beginRender = (uid, scene) => {
        const id = renderer.info.frame;
        let frame = frames.get(id);
        if (!frame) frames.set(id, frame = { gpu: [], draws: 0 });
        frame.gpu.push(uid);
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
                for (const sample of complete.values()) {
                    if (!sample.ao) continue;
                    performance.mark('City GPU frame', { detail: {
                        frameMs: sample.gpu.reduce((sum, pass) => sum + (backend.getTimestamp(pass) || 0), 0),
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
    const detail = { tile, cell: timing.id };
    if (timing.phase === 'visible') {
        performance.measure('City cell: ready → visible', { start: timing.readyAt, end: timing.visibleAt, detail });
        return;
    }
    const { admittedAt, compilingAt, readyAt, shaders } = timing;
    performance.measure('City cell: mount + assets', { start: admittedAt, end: compilingAt, detail });
    performance.measure('City cell: shader warmup', { start: compilingAt, end: readyAt, detail: { ...detail, ...shaders } });
    performance.measure('City cell: admitted → ready', { start: admittedAt, end: readyAt, detail });
}
