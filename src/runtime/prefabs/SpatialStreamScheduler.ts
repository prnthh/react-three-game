import { Box3, Matrix4, Vector3 } from 'three';
import { finitePositive, STREAMING_DEFAULTS, type PrefabStreamingOptions } from './spatialPrefabPlan.js';

export type StreamPhase = 'cold' | 'preparing' | 'ready' | 'error';
export interface SpatialStreamEntry {
    bounds: Box3;
    phase: StreamPhase;
    visible: boolean;
    mount(): void;
    unmount(): void;
    setVisible(visible: boolean): void;
}

export interface SpatialStreamPlacement {
    entries: readonly SpatialStreamEntry[];
    matrix(): Matrix4;
    options: PrefabStreamingOptions;
}

/** One admission queue for every streamed placement in a canvas. */
export class SpatialStreamScheduler {
    private placements = new Set<SpatialStreamPlacement>();
    private box = new Box3();
    register(placement: SpatialStreamPlacement) {
        this.placements.add(placement);
        return () => { this.placements.delete(placement); };
    }
    update(camera: Vector3) {
        let nearest: SpatialStreamEntry | undefined, nearestDistance = Infinity;
        let eviction: SpatialStreamEntry | undefined, evictionDistance = -Infinity;
        let preparing = false;
        for (const placement of this.placements) {
            const matrix = placement.matrix(), options = placement.options;
            const visibleRange = finitePositive(options.visibleDistance, STREAMING_DEFAULTS.visibleDistance);
            const preloadRange = Math.max(visibleRange, finitePositive(options.preloadDistance, STREAMING_DEFAULTS.preloadDistance));
            const unloadRange = Math.max(preloadRange, finitePositive(options.unloadDistance, STREAMING_DEFAULTS.unloadDistance));
            for (const entry of placement.entries) {
                const distance = this.box.copy(entry.bounds).applyMatrix4(matrix).distanceToPoint(camera);
                const visible = entry.phase === 'ready' && distance <= visibleRange;
                if (entry.visible !== visible) { entry.visible = visible; entry.setVisible(visible); }
                if (entry.phase === 'preparing') preparing = true;
                if (entry.phase !== 'cold' && distance > unloadRange && distance > evictionDistance) {
                    eviction = entry; evictionDistance = distance;
                }
                if (entry.phase === 'cold' && distance <= preloadRange && distance < nearestDistance) {
                    nearest = entry; nearestDistance = distance;
                }
            }
        }
        // Unmounts can be expensive too. Spread both directions of travel across
        // frames, and cancel stale preparation before admitting another chunk.
        if (eviction) {
            eviction.phase = 'cold'; eviction.visible = false;
            eviction.unmount();
            return;
        }
        if (!preparing && nearest) {
            nearest.phase = 'preparing';
            nearest.mount();
        }
    }
}
