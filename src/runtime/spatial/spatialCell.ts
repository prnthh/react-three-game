import type { Box3, Vector3 } from 'three';

export const DEFAULT_SPATIAL_CELL_SIZE = 24;

/** Cell coordinates use floor so negative positions share the same boundary convention. */
export function spatialCellKey(position: Pick<Vector3, 'x' | 'y' | 'z'>, cellSize: number) {
    return `${Math.floor(position.x / cellSize)},${Math.floor(position.y / cellSize)},${Math.floor(position.z / cellSize)}`;
}

/** Address a sparse loose octree by level and integer coordinates. Each octant
 * has twice its nominal width; an object crossing its loose bounds stays higher. */
export function looseOctreeKey(bounds: Box3, center: Vector3, leafSize: number) {
    let width = leafSize;
    for (let level = 0; ; level++, width *= 2) {
        const fits = (axis: 'x' | 'y' | 'z') => {
            const middle = (Math.floor(center[axis] / width) + 0.5) * width;
            return bounds.min[axis] >= middle - width && bounds.max[axis] <= middle + width;
        };
        if (fits('x') && fits('y') && fits('z')) return level + '/' + spatialCellKey(center, width);
        if (!Number.isFinite(width)) throw new Error('Invalid spatial bounds');
    }
}
