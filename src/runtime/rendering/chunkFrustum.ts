import { Frustum, Matrix4, type Box3, type Camera, type Group, type Object3D, type Scene } from 'three';
import { visitChunkTree, type ChunkTree } from '../spatial/chunkTree.js';

interface DrawCell { bounds: Box3; group: Group; }
type DrawQuery = (camera: Camera) => readonly DrawCell[];
const draws = new WeakMap<Object3D, DrawQuery>();
const placements = new WeakMap<Scene, Set<DrawQuery>>();

export function getSceneDrawCells(scene: Scene) {
    return placements.get(scene);
}

/** Ready cells are appended by plan index. Projection and occlusion share the
 * last camera query, including the placement transform and depth convention. */
export function registerChunkDraws(renderer: object, scene: Scene, group: Group, cells: ReadonlyMap<number, DrawCell>, tree: ChunkTree) {
    const clip = new Matrix4(), previous = new Matrix4(), frustum = new Frustum();
    const candidates: DrawCell[] = [];
    let count = -1, coordinateSystem: Camera['coordinateSystem'], reversedDepth: boolean;
    const collect = (cell: DrawCell) => { if (frustum.intersectsBox(cell.bounds)) candidates.push(cell); };
    const intersects = (bounds: Box3) => frustum.intersectsBox(bounds);
    const visit = (index: number) => { const cell = cells.get(index); if (cell) collect(cell); };
    const query: DrawQuery = camera => {
        clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld);
        if (count === cells.size && coordinateSystem === camera.coordinateSystem &&
            reversedDepth === camera.reversedDepth && previous.equals(clip)) return candidates;
        previous.copy(clip);
        count = cells.size;
        coordinateSystem = camera.coordinateSystem;
        reversedDepth = camera.reversedDepth;
        frustum.setFromProjectionMatrix(clip, coordinateSystem, reversedDepth);
        candidates.length = 0;
        // Short ready lists are cheaper to scan than a mostly empty hierarchy.
        if (count > 128) visitChunkTree(tree, intersects, visit);
        else if (count && intersects(tree.bounds)) cells.forEach(collect);
        return candidates;
    };
    draws.set(group, query);
    let groups = placements.get(scene);
    if (!groups) placements.set(scene, groups = new Set());
    groups.add(query);
    const release = retainChunkProjection(renderer);
    return () => { if (groups.delete(query)) { draws.delete(group); release(); } };
}

type Project = (object: Object3D, camera: Camera, order: number, list: unknown, clipping: unknown) => void;
type OcclusionPass = (scene: Scene, camera: Camera) => ReadonlySet<Object3D> | undefined;
type Pipeline = { project: Project };
const projections = new WeakMap<Pipeline, { users: number; passes: Set<OcclusionPass>; restore: () => void }>();

/** Only renderers with streamed draws or an authored occlusion pass need a projection hook. */
export function retainChunkProjection(renderer: object, pass?: OcclusionPass) {
    const pipeline = (renderer as { drawingPipeline?: Pipeline }).drawingPipeline;
    if (!pipeline) return () => {};
    let state = projections.get(pipeline);
    if (!state) {
        const passes = new Set<OcclusionPass>();
        const original = pipeline.project;
        let hidden: ReadonlySet<Object3D> | undefined, view: Camera | undefined;
        const project: Project = function (this: Pipeline, object, camera, order, list, clipping) {
            if (!object.visible) return;
            if (passes.size && 'isScene' in object) {
                const previous = hidden, previousView = view;
                try {
                    hidden = undefined;
                    view = camera;
                    for (const test of passes) {
                        hidden = test(object as Scene, camera);
                        if (hidden) break;
                    }
                    return original.call(this, object, camera, order, list, clipping);
                } finally { hidden = previous; view = previousView; }
            }
            const query = 'isGroup' in object && draws.get(object);
            if (!query || 'isArrayCamera' in camera) return original.call(this, object, camera, order, list, clipping);
            const groupOrder = object.layers.test(camera.layers) ? object.renderOrder : order;
            for (const { group } of query(camera)) {
                if (group.visible && !(view === camera && hidden?.has(group))) this.project(group, camera, groupOrder, list, clipping);
            }
        };
        pipeline.project = project;
        projections.set(pipeline, state = { users: 0, passes, restore() {
            if (pipeline.project === project) pipeline.project = original;
        } });
    }
    state.users++;
    if (pass) state.passes.add(pass);
    return () => {
        if (pass) state.passes.delete(pass);
        if (--state.users === 0) { state.restore(); projections.delete(pipeline); }
    };
}
