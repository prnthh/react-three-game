import { box, capsule, convexHull, cylinder, sphere, triangleMesh, transformed, type Shape } from "crashcat";
import { Matrix4, Vector3, type Object3D } from "three";
import type { CrashcatPhysicsProperties } from "./CrashcatPhysicsComponent";

const inverseWorldMatrix = new Matrix4();
const childToLocalMatrix = new Matrix4();
const scratchVertex = new Vector3();
const scratchScale = new Vector3();
const scratchBoundsSize = new Vector3();

type GeometryData = { positions: number[]; indices: number[] };

function collectGeometryData(object: Object3D): GeometryData | null {
    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    inverseWorldMatrix.copy(object.matrixWorld).invert();
    object.getWorldScale(scratchScale);

    object.traverse((child) => {
        const geometry = (child as Object3D & {
            geometry?: {
                attributes?: { position?: { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } };
                index?: { count: number; getX: (i: number) => number } | null;
            };
        }).geometry;
        const positionAttribute = geometry?.attributes?.position;
        if (!positionAttribute) return;

        childToLocalMatrix.multiplyMatrices(inverseWorldMatrix, child.matrixWorld);

        for (let i = 0; i < positionAttribute.count; i += 1) {
            scratchVertex
                .set(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i))
                .applyMatrix4(childToLocalMatrix)
                .multiply(scratchScale);
            positions.push(scratchVertex.x, scratchVertex.y, scratchVertex.z);
        }

        if (geometry.index) {
            for (let i = 0; i < geometry.index.count; i += 1) {
                indices.push(vertexOffset + geometry.index.getX(i));
            }
        } else {
            for (let i = 0; i < positionAttribute.count; i += 1) {
                indices.push(vertexOffset + i);
            }
        }

        vertexOffset += positionAttribute.count;
    });

    if (positions.length === 0 || indices.length < 3) return null;
    return { positions, indices };
}

export function createShapeForObject(object: Object3D, physics: CrashcatPhysicsProperties) {
    object.updateWorldMatrix(true, true);

    if (physics.colliders === "trimesh") {
        const geometry = collectGeometryData(object);
        return geometry ? triangleMesh.create(geometry) : null;
    }

    if (physics.colliders === "hull") {
        const geometry = collectGeometryData(object);
        return geometry ? convexHull.create({ positions: geometry.positions }) : null;
    }

    if (physics.colliders === "capsule") {
        return capsule.create({
            radius: Math.max(physics.capsuleRadius ?? 0.35, 0.01),
            halfHeightOfCylinder: Math.max(physics.capsuleHalfHeight ?? 0.45, 0.01),
        });
    }

    const geometry = collectGeometryData(object);
    if (!geometry) return null;

    if (physics.colliders === "ball") {
        let maxRadiusSq = 0;
        for (let i = 0; i < geometry.positions.length; i += 3) {
            const x = geometry.positions[i];
            const y = geometry.positions[i + 1];
            const z = geometry.positions[i + 2];
            maxRadiusSq = Math.max(maxRadiusSq, x * x + y * y + z * z);
        }
        return sphere.create({ radius: Math.max(Math.sqrt(maxRadiusSq), 0.01) });
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < geometry.positions.length; i += 3) {
        const x = geometry.positions[i];
        const y = geometry.positions[i + 1];
        const z = geometry.positions[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    scratchBoundsSize.set(maxX - minX, maxY - minY, maxZ - minZ);

    const center: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const atCenter = (shape: Shape) => center.some(value => value !== 0)
        ? transformed.create({ shape, position: center, quaternion: [0, 0, 0, 1] })
        : shape;

    if (physics.colliders === "cylinder") {
        return atCenter(cylinder.create({
            radius: Math.max(physics.cylinderRadius ?? Math.max(scratchBoundsSize.x, scratchBoundsSize.z) * 0.5, 0.01),
            halfHeight: Math.max(physics.cylinderHalfHeight ?? scratchBoundsSize.y * 0.5, 0.01),
        }));
    }

    return atCenter(box.create({
        halfExtents: [
            Math.max(scratchBoundsSize.x * 0.5, 0.01),
            Math.max(scratchBoundsSize.y * 0.5, 0.01),
            Math.max(scratchBoundsSize.z * 0.5, 0.01),
        ],
    }));
}

