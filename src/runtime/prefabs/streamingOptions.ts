export interface PrefabStreamingOptions {
    /** Spatial partition width in prefab-local units. */
    cellSize?: number;
    /** Cap each React mount/unmount unit, including copied transform ancestors. */
    maxNodesPerChunk?: number;
}

export const STREAMING_DEFAULTS: Required<PrefabStreamingOptions> = {
    cellSize: 64, maxNodesPerChunk: 96,
};

export function finitePositive(value: number | undefined, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
