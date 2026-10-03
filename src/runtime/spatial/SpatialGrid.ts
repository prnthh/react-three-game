import type { Vector3 } from 'three';

export const DEFAULT_SPATIAL_CELL_SIZE = 24;

/** Generic point membership for spatial batching. Bounds remain owned by each consumer. */
export class SpatialGrid<T> {
    readonly cellSize: number;
    private membership = new Map<T, string>();
    private cells = new Map<string, Set<T>>();
    constructor(cellSize = DEFAULT_SPATIAL_CELL_SIZE) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Spatial cell size must be positive and finite');
        this.cellSize = cellSize;
    }
    key(position: Pick<Vector3, 'x' | 'y' | 'z'>) {
        return `${Math.floor(position.x / this.cellSize)},${Math.floor(position.y / this.cellSize)},${Math.floor(position.z / this.cellSize)}`;
    }
    update(value: T, position: Pick<Vector3, 'x' | 'y' | 'z'>) {
        const key = this.key(position);
        if (this.membership.get(value) === key) return false;
        this.remove(value);
        let cell = this.cells.get(key);
        if (!cell) this.cells.set(key, cell = new Set());
        cell.add(value);
        this.membership.set(value, key);
        return true;
    }
    remove(value: T) {
        const key = this.membership.get(value);
        if (key === undefined) return;
        const cell = this.cells.get(key)!;
        cell.delete(value);
        if (!cell.size) this.cells.delete(key);
        this.membership.delete(value);
    }
    cellOf(value: T) { return this.membership.get(value); }
    values(key: string): Iterable<T> { return this.cells.get(key) ?? []; }
}
