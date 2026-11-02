import { createContext } from 'react';
import { resolveComponentProperties } from '../../core/ComponentRegistry.js';
import { findComponent, type GameObject } from '../../core/types.js';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { STREAMING_DEFAULTS, type PrefabStreamingOptions } from '../prefabs/spatialPrefabPlan.js';
import { DEFAULT_SPATIAL_CELL_SIZE } from '../spatial/spatialCell.js';

export interface ChunkSettingsProperties extends Required<PrefabStreamingOptions> { batchCellSize: number }
export const ChunkSettingsContext = createContext<ChunkSettingsProperties | null>(null);
function ChunkSettingsView({ properties, children }: ComponentViewProps<ChunkSettingsProperties>) {
    return <ChunkSettingsContext.Provider value={properties}>{children}</ChunkSettingsContext.Provider>;
}
const ChunkSettingsComponent: Component<ChunkSettingsProperties> = {
    name: 'ChunkSettings', scope: 'scene', exclusive: 'chunk-settings', category: 'misc', View: ChunkSettingsView,
    description: 'Scene-root spatial policy. Static PrefabInstance placements inherit distance streaming; ordinary meshes inherit the batch cell size. Without this component, static prefabs load whole and batching uses its normal grid.',
    properties: {
        batchCellSize: { default: DEFAULT_SPATIAL_CELL_SIZE, min: 1, description: 'Spatial cell size for automatic mesh batches, in world units.' },
        cellSize: { default: STREAMING_DEFAULTS.cellSize, min: 1, description: 'Static scenery partition width, in prefab-local units.' },
        visibleDistance: { default: STREAMING_DEFAULTS.visibleDistance, min: 1 },
        preloadDistance: { default: STREAMING_DEFAULTS.preloadDistance, min: 1 },
        unloadDistance: { default: STREAMING_DEFAULTS.unloadDistance, min: 1 },
        maxNodesPerChunk: { default: STREAMING_DEFAULTS.maxNodesPerChunk, min: 8, step: 1 },
    },
};
export function readChunkSettings(root: GameObject) {
    const entry = !root.disabled && !root.hidden && findComponent(root, 'ChunkSettings');
    return entry ? resolveComponentProperties(ChunkSettingsComponent, entry.properties as ChunkSettingsProperties) : null;
}
export default ChunkSettingsComponent;
