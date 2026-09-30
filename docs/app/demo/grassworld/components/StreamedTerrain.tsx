import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { MotionType, rigidBody, triangleMesh } from "crashcat";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import {
    Color,
    Float32BufferAttribute,
    LinearSRGBColorSpace,
    MeshStandardMaterial,
    PlaneGeometry,
    RepeatWrapping,
    Vector2,
    Vector3,
} from "three";

import { withBasePath } from "../../../basePath";
import { usePlayerRuntime } from "./GrassWorldRuntime";

import { TERRAIN_SEGMENTS } from "../terrain";
import Grass, { useVegetationResources } from "./Grass";
const TERRAIN_NORMAL_SCALE = new Vector2(0.85, 0.85);
const ASSETS = {
    groundNormal: withBasePath("/grassworld/textures/ground-normal.jpg"),
    groundAo: withBasePath("/grassworld/textures/ground-ao.jpg"),
};

type ChunkCoordinate = { x: number; z: number };

type TerrainChunkProps = ChunkCoordinate & {
    chunkSize: number;
    heightAt: (x: number, z: number) => number;
    material: MeshStandardMaterial;
    waterLevel: number;
};

const TerrainChunk = memo(function TerrainChunk({
    x,
    z,
    chunkSize,
    heightAt,
    material,
    waterLevel,
}: TerrainChunkProps) {
    const crashcat = useCrashcat();
    const geometry = useMemo(() => {
        const value = new PlaneGeometry(chunkSize, chunkSize, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
        value.rotateX(-Math.PI / 2);
        const positions = value.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        const originX = x * chunkSize;
        const originZ = z * chunkSize;
        const sandColor = new Color().setRGB(0.7, 0.55, 0.29);
        const grassColor = new Color().setRGB(0.29, 0.38, 0.13);
        const vertexColor = new Color();

        for (let index = 0; index < positions.count; index += 1) {
            const worldX = originX + positions.getX(index);
            const worldZ = originZ + positions.getZ(index);
            const height = heightAt(worldX, worldZ);
            positions.setY(index, height);

            const t = Math.max(0, Math.min(1, (height - (waterLevel + 0.2)) / 1.15));
            const grassBlend = t * t * (3 - 2 * t);
            const variation = 0.9 + 0.1 * Math.sin(worldX * 0.31 + Math.sin(worldZ * 0.23));
            vertexColor.lerpColors(sandColor, grassColor, grassBlend).multiplyScalar(variation);
            vertexColor.toArray(colors, index * 3);
        }

        positions.needsUpdate = true;
        value.setAttribute("color", new Float32BufferAttribute(colors, 3));
        value.setAttribute("uv1", value.attributes.uv);
        const normals = value.attributes.normal;
        const normal = new Vector3();
        const epsilon = 0.05;
        for (let i = 0; i < positions.count; i++) {
            const wx = originX + positions.getX(i), wz = originZ + positions.getZ(i);
            normal.set(heightAt(wx - epsilon, wz) - heightAt(wx + epsilon, wz), 2 * epsilon,
                heightAt(wx, wz - epsilon) - heightAt(wx, wz + epsilon)).normalize();
            normals.setXYZ(i, normal.x, normal.y, normal.z);
        }
        return value;
    }, [chunkSize, heightAt, waterLevel, x, z]);

    useEffect(() => {
        if (!crashcat || !geometry.index) return;
        const nodeId = `grassworld-terrain-${x}:${z}`;
        const shape = triangleMesh.create({
            positions: Array.from(geometry.attributes.position.array),
            indices: Array.from(geometry.index.array),
        });
        const body = rigidBody.create(crashcat.world, {
            shape,
            motionType: MotionType.STATIC,
            objectLayer: crashcat.staticObjectLayer,
            position: [x * chunkSize, 0, z * chunkSize],
            friction: 0.9,
            restitution: 0,
            enhancedInternalEdgeRemoval: true,
            userData: { nodeId },
        });
        crashcat.register(nodeId, body, { motionType: MotionType.STATIC, sensor: false });
        return () => crashcat.unregister(nodeId);
    }, [chunkSize, crashcat, geometry, x, z]);

    // R3F owns the mounted geometry and defers GPU disposal when a chunk leaves.
    // The streamer owns the material shared by all chunks.
    return <mesh material={material} position={[x * chunkSize, 0, z * chunkSize]} receiveShadow>
        <bufferGeometry index={geometry.index} attributes={geometry.attributes} />
    </mesh>;
});

export default function StreamedTerrain({
    chunkRadius,
    chunkSize,
    heightAt,
    waterLevel,
    shoreClearance,
    transitionWidth,
}: {
    chunkRadius: number;
    chunkSize: number;
    heightAt: (x: number, z: number) => number;
    waterLevel: number;
    shoreClearance: number;
    transitionWidth: number;
}) {
    const runtime = usePlayerRuntime();
    const vegetation = useVegetationResources();
    const [center, setCenter] = useState<ChunkCoordinate>({ x: 0, z: 0 });
    const renderedCenter = useRef<ChunkCoordinate>({ x: 0, z: 0 });
    const [normalMap, aoMap] = useTexture([ASSETS.groundNormal, ASSETS.groundAo]);

    useEffect(() => {
        for (const texture of [normalMap, aoMap]) {
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.repeat.set(7, 7);
            texture.colorSpace = LinearSRGBColorSpace;
            texture.needsUpdate = true;
        }
    }, [normalMap, aoMap]);

    const material = useMemo(() => new MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        normalMap,
        normalScale: TERRAIN_NORMAL_SCALE,
        aoMap,
        aoMapIntensity: 0.82,
        roughness: 0.94,
        metalness: 0,
    }), [aoMap, normalMap]);
    useEffect(() => () => material.dispose(), [material]);

    useFrame(() => {
        if (!runtime) return;
        const { x, z } = runtime.position;
        const nextX = Math.round(x / chunkSize);
        const nextZ = Math.round(z / chunkSize);
        if (renderedCenter.current.x === nextX && renderedCenter.current.z === nextZ) return;
        renderedCenter.current = { x: nextX, z: nextZ };
        setCenter({ x: nextX, z: nextZ });
    });

    const chunks = [];
    for (let z = center.z - chunkRadius; z <= center.z + chunkRadius; z += 1) {
        for (let x = center.x - chunkRadius; x <= center.x + chunkRadius; x += 1) {
            chunks.push(
                <group key={`${x}:${z}`} name={`terrain-chunk-${x}:${z}`}>
                    <TerrainChunk
                        x={x}
                        z={z}
                        chunkSize={chunkSize}
                        heightAt={heightAt}
                        material={material}
                        waterLevel={waterLevel}
                    />
                    <group position={[x * chunkSize, 0, z * chunkSize]}>
                        <Grass x={x} z={z} chunkSize={chunkSize} heightAt={heightAt} waterLevel={waterLevel}
                            shoreClearance={shoreClearance} transitionWidth={transitionWidth} resources={vegetation} />
                    </group>
                </group>,
            );
        }
    }
    return <>{chunks}</>;
}
