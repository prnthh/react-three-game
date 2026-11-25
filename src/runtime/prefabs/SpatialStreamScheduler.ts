import { Frustum, Matrix4, Vector3, Box3, type Camera } from 'three';
import { visitChunkTree, type ChunkTree } from '../spatial/chunkTree.js';

export interface SpatialStreamEntry {
    bounds: Box3;
    rendererBounds: readonly Box3[];
    phase: 'cold' | 'preparing' | 'ready' | 'error';
    mount(): void;
}

export interface SpatialStreamPlacement {
    entries: readonly SpatialStreamEntry[];
    tree: ChunkTree;
    matrix(): Matrix4;
}

/** Admit one cell per frame, with room for a second while the first waits on assets. */
export class SpatialStreamScheduler {
    private pending = new Map<SpatialStreamPlacement, number>();
    private preparing = new Set<SpatialStreamEntry>();
    private eye = new Vector3();
    private localEye = new Vector3();
    private translation = new Matrix4();
    private worldBounds = new Box3();
    private clip = new Matrix4();
    private frustum = new Frustum();

    get hasPending() { return this.pending.size > 0; }

    register(placement: SpatialStreamPlacement) {
        let cold = 0;
        for (const entry of placement.entries) {
            if (entry.phase === 'cold') cold++;
            if (entry.phase === 'preparing') this.preparing.add(entry);
        }
        if (cold) this.pending.set(placement, cold);
        return () => {
            this.pending.delete(placement);
            for (const entry of this.preparing) if (placement.entries.includes(entry)) this.preparing.delete(entry);
        };
    }
    update(camera: Camera) {
        if (!this.pending.size) return;
        for (const entry of this.preparing) if (entry.phase !== 'preparing') this.preparing.delete(entry);
        if (this.preparing.size >= 2) return;
        camera.updateWorldMatrix(true, false);
        this.eye.setFromMatrixPosition(camera.matrixWorld);
        let best = Infinity;
        let chosen: SpatialStreamEntry | undefined;
        let owner: SpatialStreamPlacement | undefined;
        for (const placement of this.pending.keys()) {
            const matrix = placement.matrix();
            this.localEye.setFromMatrixPosition(matrix);
            const translated = this.translation.makeTranslation(this.localEye).equals(matrix);
            this.localEye.negate().add(this.eye);
            const distanceTo = (bounds: Box3) => translated ? bounds.distanceToPoint(this.localEye)
                : this.worldBounds.copy(bounds).applyMatrix4(matrix).distanceToPoint(this.eye);
            this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(matrix);
            this.frustum.setFromProjectionMatrix(this.clip, camera.coordinateSystem, camera.reversedDepth);
            visitChunkTree(placement.tree, bounds => distanceTo(bounds) <= best, i => {
                const entry = placement.entries[i];
                if (entry.phase !== 'cold' || distanceTo(entry.bounds) >= best) return;
                // A camera can be inside a cell's aggregate bounds and still be
                // a street away from every mesh in it. Rank the nearest renderer.
                for (const bounds of entry.rendererBounds) {
                    const distance = distanceTo(bounds);
                    if (distance >= best) continue;
                    const score = this.frustum.intersectsBox(bounds) ? distance : 2 * distance;
                    if (score < best) {
                        best = score;
                        chosen = entry;
                        owner = placement;
                    }
                    if (best === 0) break;
                }
            });
        }
        if (!chosen || !owner) return;
        const remaining = this.pending.get(owner)! - 1;
        if (remaining) this.pending.set(owner, remaining);
        else this.pending.delete(owner);
        this.preparing.add(chosen);
        chosen.phase = 'preparing';
        chosen.mount();
    }
}
