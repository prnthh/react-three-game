import { Box3, Matrix4, Vector4, type Camera, type Group, type InstancedMesh, type Mesh, type Object3D, type Scene } from 'three';
import { MeshPhysicalNodeMaterial, type WebGPURenderer } from 'three/webgpu';

import { getSceneDrawCells, retainChunkProjection } from './chunkFrustum.js';

const WIDTH = 32, HEIGHT = 20;
const stats = new WeakMap<WebGPURenderer, { tested: number; culled: number; cpuMs: number }>();

export function profileChunkOcclusion(renderer: WebGPURenderer) {
    stats.set(renderer, { tested: 0, culled: 0, cpuMs: 0 });
    return () => { stats.delete(renderer); };
}

export const getChunkOcclusionStats = (renderer: WebGPURenderer) => stats.get(renderer);

type Point = { x: number; y: number };
type Projection = { points: Point[]; left: number; right: number; bottom: number; top: number; near: number; far: number };
const turn = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function projectBounds(box: Box3, matrix: Matrix4, point: Vector4, boxOnScreen: Projection, silhouette = false) {
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, near = Infinity, far = -Infinity;
    for (let corner = 0; corner < 8; corner++) {
        point.set(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z, 1).applyMatrix4(matrix);
        // A box crossing the camera or a clip plane must stay visible.
        if (point.w <= 0 || point.z <= 0 || point.z >= point.w) return;
        const x = (point.x / point.w + 1) * WIDTH / 2;
        const y = (point.y / point.w + 1) * HEIGHT / 2;
        const z = point.z / point.w;
        if (silhouette) {
            boxOnScreen.points[corner].x = x;
            boxOnScreen.points[corner].y = y;
        }
        left = Math.min(left, x); right = Math.max(right, x);
        bottom = Math.min(bottom, y); top = Math.max(top, y);
        near = Math.min(near, z); far = Math.max(far, z);
    }
    if (right <= 0 || left >= WIDTH || top <= 0 || bottom >= HEIGHT) return;
    boxOnScreen.left = left; boxOnScreen.right = right;
    boxOnScreen.bottom = bottom; boxOnScreen.top = top;
    boxOnScreen.near = near; boxOnScreen.far = far;
    return boxOnScreen;
}

/** Rasterize the box silhouette. A tile stores depth only if its entire area is covered. */
function rasterizeOccluder(depth: Float32Array, { points, left, right, bottom, top, far }: Projection, hull: Point[]) {
    const minX = Math.max(0, Math.ceil(left)), maxX = Math.min(WIDTH, Math.floor(right));
    const minY = Math.max(0, Math.ceil(bottom)), maxY = Math.min(HEIGHT, Math.floor(top));
    if (minX >= maxX || minY >= maxY) return false;
    points.sort((a, b) => a.x - b.x || a.y - b.y);
    hull.length = 0;
    for (const point of points) {
        while (hull.length >= 2 && turn(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
        hull.push(point);
    }
    const lowerLength = hull.length;
    for (let i = points.length - 2; i >= 0; i--) {
        const point = points[i];
        while (hull.length > lowerLength && turn(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
        hull.push(point);
    }
    hull.pop();
    if (hull.length < 3) return false;
    let wroteDepth = false;
    for (let y = minY; y < maxY; y++) {
        let start = minX, end = maxX;
        // Intersect this row with each inward half-plane. Its least-covered tile
        // corner must clear the edge, so partial tiles never contribute depth.
        for (let i = 0; i < hull.length && start < end; i++) {
            const a = hull[i], b = hull[(i + 1) % hull.length];
            const dx = b.x - a.x, dy = b.y - a.y;
            const clearance = dx * (y + Number(dx < 0) - a.y) - 1e-6;
            if (dy > 0) end = Math.min(end, Math.ceil(a.x - 1 + clearance / dy));
            else if (dy < 0) start = Math.max(start, Math.floor(a.x + clearance / dy) + 1);
            else if (clearance <= 0) end = start;
        }
        if (start >= end) continue;
        wroteDepth = true;
        const row = y * WIDTH;
        for (let x = start; x < end; x++) depth[row + x] = Math.min(depth[row + x], far);
    }
    return wroteDepth;
}

type Occluder = { mesh: Mesh; box: Box3; instance?: number; score: number };
function isOpaque(mesh: Mesh) {
    const material = mesh.material;
    return material instanceof MeshPhysicalNodeMaterial && material.visible && !material.transparent && material.alphaTest === 0
        && material.depthWrite && material.depthTest && material.opacity === 1 && !material.wireframe && material.side !== 1
        && material.transmission === 0 && !material.displacementMap && !material.positionNode && !material.maskNode
        && !material.depthNode && !material.opacityNode && !material.clippingPlanes?.length;
}

function getOccluders(group: Group) {
    const candidates: Occluder[] = [];
    const matrix = new Matrix4();
    group.traverseVisible(object => {
        const mesh = object as Mesh;
        if (!mesh.isMesh || mesh.geometry.type !== 'BoxGeometry' || mesh.geometry.drawRange.start !== 0
            || mesh.geometry.drawRange.count !== Infinity || !isOpaque(mesh)) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        if (!box) return;
        const instance = mesh as InstancedMesh;
        for (let i = 0; i < (instance.isInstancedMesh ? instance.count : 1); i++) {
            if (instance.isInstancedMesh) {
                instance.getMatrixAt(i, matrix);
                matrix.premultiply(mesh.matrixWorld);
            } else matrix.copy(mesh.matrixWorld);
            const m = matrix.elements;
            const x = (box.max.x - box.min.x) * Math.hypot(m[0], m[1], m[2]);
            const y = (box.max.y - box.min.y) * Math.hypot(m[4], m[5], m[6]);
            const z = (box.max.z - box.min.z) * Math.hypot(m[8], m[9], m[10]);
            if (Math.min(x, y, z) < 2 || Math.max(x, y, z) < 12) continue;
            const score = x * y * z;
            if (candidates.length === 2 && score <= candidates[1].score) continue;
            candidates.push({ mesh, box, instance: instance.isInstancedMesh ? i : undefined, score });
            candidates.sort((a, b) => b.score - a.score);
            candidates.length = Math.min(2, candidates.length);
        }
    });
    return candidates;
}

// Installed only on the opt-in main scene render. Shadow/capture/compilation
// cameras retain Three's normal projection and the streamer retains ownership.
export function installChunkOcclusion(renderer: WebGPURenderer, scene: Scene, camera: Camera, target: unknown) {
    if (renderer.reversedDepthBuffer || 'isArrayCamera' in camera) return () => {};
    const depth = new Float32Array(WIDTH * HEIGHT);
    const viewProjection = new Matrix4(), matrix = new Matrix4(), point = new Vector4();
    const candidates = new WeakMap<Group, Occluder[]>();
    const hidden = new Set<Object3D>();
    const boxOnScreen: Projection = { points: Array.from({ length: 8 }, () => ({ x: 0, y: 0 })),
        left: 0, right: 0, bottom: 0, top: 0, near: 0, far: 0 };
    const hull: Point[] = [];
    function prepass(counts: ReturnType<typeof getChunkOcclusionStats>) {
        if (counts) counts.tested = 0;
        const placements = getSceneDrawCells(scene);
        if (!placements?.size) return;
        depth.fill(1);
        let hasDepth = false;
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        for (const query of placements) for (const { group } of query(camera)) {
            let parent: Object3D | null = group;
            while (parent?.visible && !('isClippingGroup' in parent) && parent !== scene) parent = parent.parent;
            if (parent !== scene) continue;
            let boxes = candidates.get(group);
            if (!boxes) candidates.set(group, boxes = getOccluders(group));
            for (const { mesh, box, instance } of boxes) {
                if (!isOpaque(mesh) || !mesh.layers.test(camera.layers)) continue;
                let ancestor: Object3D | null = mesh;
                while (ancestor?.visible && !('isClippingGroup' in ancestor) && ancestor !== group) ancestor = ancestor.parent;
                if (ancestor !== group) continue;
                if (instance !== undefined) {
                    (mesh as InstancedMesh).getMatrixAt(instance, matrix);
                    matrix.premultiply(mesh.matrixWorld);
                } else matrix.copy(mesh.matrixWorld);
                const projected = projectBounds(box, matrix.premultiply(viewProjection), point, boxOnScreen, true);
                if (projected && rasterizeOccluder(depth, projected, hull)) hasDepth = true;
            }
        }
        if (!hasDepth) return;
        for (const query of placements) for (const { group, bounds } of query(camera)) {
            if (!group.visible || !group.parent) continue;
            matrix.multiplyMatrices(viewProjection, group.matrixWorld);
            const box = projectBounds(bounds, matrix, point, boxOnScreen);
            if (!box) continue;
            if (counts) counts.tested++;
            const left = Math.max(0, Math.floor(box.left)), right = Math.min(WIDTH, Math.ceil(box.right));
            const bottom = Math.max(0, Math.floor(box.bottom)), top = Math.min(HEIGHT, Math.ceil(box.top));
            let occluded = true;
            for (let y = bottom; y < top && occluded; y++) {
                for (let x = left; x < right && occluded; x++) occluded = depth[y * WIDTH + x] + 0.00001 < box.near;
            }
            if (occluded) hidden.add(group);
        }
    }
    return retainChunkProjection(renderer, (root, view) => {
        if (root !== scene || view !== camera || renderer.getRenderTarget() !== target || scene.overrideMaterial) return;
        const counts = stats.get(renderer);
        const start = counts ? performance.now() : 0;
        hidden.clear();
        prepass(counts);
        if (counts) {
            counts.cpuMs = performance.now() - start;
            counts.culled = hidden.size;
        }
        return hidden;
    });
}
