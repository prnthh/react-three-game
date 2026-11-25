export interface PrefabStreamingOptions {
    /** Spatial partition width in prefab-local units. */
    cellSize?: number;
    /** Ready chunks become visible inside this world-space distance from their bounds. */
    visibleDistance?: number;
    /** Prepare ahead of the visible range. */
    preloadDistance?: number;
    /** Release mounted chunks outside this range. Shared source assets remain cached. */
    unloadDistance?: number;
    /** Cap each React mount/unmount unit, including copied transform ancestors. */
    maxNodesPerChunk?: number;
}

export const STREAMING_DEFAULTS: Required<PrefabStreamingOptions> = {
    cellSize: 64, visibleDistance: 160, preloadDistance: 220, unloadDistance: 280, maxNodesPerChunk: 96,
};

export function finitePositive(value: number | undefined, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
