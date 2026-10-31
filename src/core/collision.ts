import { Vector3, type Matrix4 } from 'three';

export type CollisionVector = [number, number, number];
export type BoxColliderProperties = {
    size?: CollisionVector;
    center?: CollisionVector;
};
/** Engine-neutral transformed box: vertices are relative to its world center. */
export type WorldBox = { p: CollisionVector; size: CollisionVector; vertices: CollisionVector[] };

export function compileBoxCollider(world: Matrix4, { size = [1, 1, 1], center = [0, 0, 0] }: BoxColliderProperties = {}): WorldBox {
    if (size.length !== 3 || center.length !== 3 || !size.every(v => Number.isFinite(v) && v > 0) || !center.every(Number.isFinite)
        || !world.elements.every(Number.isFinite) || Math.abs(world.determinant()) < 1e-12)
        throw new Error('BoxCollider requires positive size and a finite, invertible world transform');
    const p = new Vector3(...center).applyMatrix4(world).toArray() as CollisionVector;
    const edges = [0, 1, 2].map(i => new Vector3().setFromMatrixColumn(world, i).multiplyScalar(size[i] / 2));
    const vertices: CollisionVector[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
        vertices.push(edges[0].clone().multiplyScalar(x).addScaledVector(edges[1], y).addScaledVector(edges[2], z).toArray() as CollisionVector);
    return { p, size: [0, 1, 2].map(i => 2 * edges.reduce((sum, edge) => sum + Math.abs(edge.getComponent(i)), 0)) as CollisionVector, vertices };
}

export type MeshColliderProperties = { positions: number[]; indices?: number[]; shape?: 'trimesh' | 'convex' };
export type WorldMeshCollider = WorldBox & { shape: 'trimesh' | 'convex'; indices: number[] };

/** Blender duplicate suffixes are allowed; only explicit suffix tokens count. */
export function parseCollisionName(name: string) {
    const match = name.match(/^(.*)[_-](convcolonly|convcol|colonly|col)(?:\.\d+)?$/i);
    if (!match) return null;
    const token = match[2].toLowerCase();
    return { name: match[1] || name, visible: !token.endsWith('only'), shape: token.startsWith('conv') ? 'convex' as const : 'trimesh' as const };
}

/** Bake the complete transform, including shear and mirrored triangle winding. */
export function compileMeshCollider(world: Matrix4, { positions, indices, shape = 'trimesh' }: MeshColliderProperties): WorldMeshCollider {
    if (!Array.isArray(positions) || positions.length < 9 || positions.length % 3 || !positions.every(Number.isFinite)
        || !['trimesh', 'convex'].includes(shape) || !world.elements.every(Number.isFinite) || Math.abs(world.determinant()) < 1e-12)
        throw new Error('MeshCollider requires finite vertices and an invertible transform');
    const count = positions.length / 3;
    const triangles = indices === undefined ? Array.from({ length: count }, (_, i) => i) : [...indices];
    if (triangles.length % 3 || (shape === 'trimesh' && !triangles.length)
        || triangles.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error('MeshCollider has invalid triangle indices');
    const points: Vector3[] = [];
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < positions.length; i += 3) {
        const point = new Vector3(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(world);
        points.push(point); min.min(point); max.max(point);
    }
    const center = min.clone().add(max).multiplyScalar(0.5);
    if (world.determinant() < 0) for (let i = 0; i < triangles.length; i += 3) [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
    return { p: center.toArray() as CollisionVector, size: max.sub(min).toArray() as CollisionVector,
        vertices: points.map(point => point.sub(center).toArray() as CollisionVector), indices: triangles, shape };
}
