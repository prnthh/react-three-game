import type { Vector3 } from 'three';

export const DEFAULT_SPATIAL_CELL_SIZE = 24;

/** Cell coordinates use floor so negative positions share the same boundary convention. */
export function spatialCellKey(position: Pick<Vector3, 'x' | 'y' | 'z'>, cellSize: number) {
    return `${Math.floor(position.x / cellSize)},${Math.floor(position.y / cellSize)},${Math.floor(position.z / cellSize)}`;
}
