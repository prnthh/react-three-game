import { Frustum, Matrix4, type Box3, type Camera, type Group, type Object3D } from 'three';
import { visitChunkTree, type ChunkTree } from '../spatial/chunkTree.js';

interface DrawCell { bounds: Box3; group: Group; }
type DrawQuery = (camera: Camera) => readonly DrawCell[];
type Project = (object: Object3D, camera: Camera, order: number, list: unknown, clipping: unknown) => void;
type Pipeline = { project: Project };
const projections = new WeakMap<Pipeline, { draws: Map<Object3D, DrawQuery>; restore(): void }>();

/** Project ready cells against the camera for this render pass. */
export function registerChunkDraws(renderer: object, group: Group, cells: ReadonlyMap<number, DrawCell>, tree: ChunkTree) {
    const pipeline = (renderer as { drawingPipeline?: Pipeline }).drawingPipeline;
    if (!pipeline) return () => {};
    const clip = new Matrix4(), frustum = new Frustum();
    const candidates: DrawCell[] = [];
    const collect = (cell: DrawCell) => { if (frustum.intersectsBox(cell.bounds)) candidates.push(cell); };
    const intersects = (bounds: Box3) => frustum.intersectsBox(bounds);
    const visit = (index: number) => { const cell = cells.get(index); if (cell) collect(cell); };
    const query: DrawQuery = camera => {
        clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld);
        frustum.setFromProjectionMatrix(clip, camera.coordinateSystem, camera.reversedDepth);
        candidates.length = 0;
        // Short ready lists are cheaper to scan than a mostly empty hierarchy.
        if (cells.size > 128) visitChunkTree(tree, intersects, visit);
        else if (cells.size && intersects(tree.bounds)) cells.forEach(collect);
        return candidates;
    };
    let state = projections.get(pipeline);
    if (!state) {
        const draws = new Map<Object3D, DrawQuery>();
        const original = pipeline.project;
        const project: Project = function (this: Pipeline, object, camera, order, list, clipping) {
            if (!object.visible) return;
            const query = 'isGroup' in object && draws.get(object);
            if (!query || 'isArrayCamera' in camera) return original.call(this, object, camera, order, list, clipping);
            const groupOrder = object.layers.test(camera.layers) ? object.renderOrder : order;
            for (const { group } of query(camera)) {
                if (group.visible) this.project(group, camera, groupOrder, list, clipping);
            }
        };
        pipeline.project = project;
        projections.set(pipeline, state = { draws, restore() {
            if (pipeline.project === project) pipeline.project = original;
        } });
    }
    state.draws.set(group, query);
    return () => {
        if (state.draws.delete(group) && !state.draws.size) {
            state.restore();
            projections.delete(pipeline);
        }
    };
}
