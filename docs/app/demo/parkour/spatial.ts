import { prepareSurfaceGeometry, type Surface } from './collision';

export type Bounds3 = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
const intersects = (a: Bounds3, b: Bounds3) => a.minX <= b.maxX && a.maxX >= b.minX
    && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** Static 3D grid, built once per attempt. Like the light grid, cells use floor
 * coordinates (including negatives); collision objects occupy their full bounds.
 * Query results reuse storage and remain valid only until the next query. */
export class SurfaceGrid {
    private cells = new Map<string, number[]>();
    private oversized: number[] = [];
    private bounds: Bounds3[];
    private seen: Uint32Array;
    private generation = 0;
    private ids: number[] = [];
    private result: Surface[] = [];
    readonly cellSize: number;

    constructor(private surfaces: Surface[], cellSize = 8) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Cell size must be positive and finite');
        this.cellSize = cellSize;
        // Own immutable snapshots so cached geometry cannot outlive an authored edit.
        this.surfaces = structuredClone(surfaces);
        this.surfaces.forEach(prepareSurfaceGeometry);
        this.seen = new Uint32Array(surfaces.length);
        this.bounds = surfaces.map(surface => ({
            minX: surface.minX, maxX: surface.maxX, minZ: surface.minZ, maxZ: surface.maxZ,
            // A solid with no bottom extends downward indefinitely.
            minY: surface.bottom ?? -Infinity, maxY: surface.top,
        }));
        this.bounds.forEach((bounds, id) => {
            const range = this.range(bounds);
            // Huge floors and unbounded walls must not explode grid storage.
            if (this.cellCount(range) > 512 || !range.every(Number.isFinite)) {
                this.oversized.push(id);
                return;
            }
            this.visit(range, key => {
                const bucket = this.cells.get(key);
                if (bucket) bucket.push(id); else this.cells.set(key, [id]);
            });
        });
    }
    private range(b: Bounds3) {
        return [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].map(v => Math.floor(v / this.cellSize));
    }
    private cellCount(r: number[]) { return (r[1] - r[0] + 1) * (r[3] - r[2] + 1) * (r[5] - r[4] + 1); }
    private visit(r: number[], fn: (key: string) => void) {
        for (let x = r[0]; x <= r[1]; x++) for (let y = r[2]; y <= r[3]; y++) for (let z = r[4]; z <= r[5]; z++) fn(`${x},${y},${z}`);
    }
    query(bounds: Bounds3): Surface[] {
        this.ids.length = 0;
        this.result.length = 0;
        this.generation = (this.generation + 1) >>> 0;
        if (!this.generation) { this.seen.fill(0); this.generation = 1; }
        const add = (id: number) => {
            if (this.seen[id] === this.generation) return;
            this.seen[id] = this.generation;
            if (intersects(bounds, this.bounds[id])) this.ids.push(id);
        };
        const range = this.range(bounds);
        // Bounded fallback for unusually long sweeps or non-finite query extents.
        if (!range.every(Number.isFinite) || this.cellCount(range) > 512) {
            for (let id = 0; id < this.surfaces.length; id++) add(id);
        } else {
            this.visit(range, key => { const bucket = this.cells.get(key); if (bucket) for (const id of bucket) add(id); });
            for (const id of this.oversized) add(id);
        }
        // Contact selection and equal-height landing ties retain authored order.
        this.ids.sort((a, b) => a - b);
        for (const id of this.ids) this.result.push(this.surfaces[id]);
        return this.result;
    }
}
