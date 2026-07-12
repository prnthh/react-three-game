import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PrefabEditorMode, useScene } from "react-three-game/editor";
import {
    Color,
    DirectionalLight,
    Float32BufferAttribute,
    LinearSRGBColorSpace,
    Object3D,
    PlaneGeometry,
    Quaternion,
    RepeatWrapping,
    Texture,
    Vector2,
    Vector3,
} from "three";

import { withBasePath } from "../../basePath";
import { GameTime, GrassWorldRuntimeProvider, usePlayerRuntime } from "./components/GrassWorldRuntime";
import Water from "./components/Water";
import Grass from "./components/Grass";
import Flowers from "./components/Flowers";

const CHUNK_SIZE = 24;
const CHUNK_RADIUS = 2;
const TERRAIN_SEGMENTS = 12;
const BALL_RADIUS = 0.5;
const TERRAIN_NORMAL_SCALE = new Vector2(0.85, 0.85);
const FOG_COLOR = new Color().setRGB(0.4, 0.6, 0.3);

const ASSETS = {
    groundNormal: withBasePath("/grassworld/textures/ground-normal.jpg"),
    groundAo: withBasePath("/grassworld/textures/ground-ao.jpg"),
};

type ChunkCoord = { x: number; z: number };
export type GrassWorldConfig = {
    mapSize: number;
    waterLevel: number;
    grassShoreClearance: number;
    grassTransitionWidth: number;
};
export function terrainHeight(x: number, z: number) {
    const broad = Math.sin(x * 0.045) * 1.15 + Math.cos(z * 0.04) * 0.9;
    const crossing = Math.sin((x + z) * 0.08) * 0.45 + Math.cos((x - z) * 0.065) * 0.32;
    const detail = Math.sin(x * 0.19 + Math.cos(z * 0.12)) * 0.14;
    const shore = -2.2 + 3.6 / (1 + Math.exp(-(x + 17) * 0.26));
    return shore + broad + crossing + detail;
}

function terrainNormal(x: number, z: number, target: Vector3) {
    const epsilon = 0.12;
    const dx = terrainHeight(x + epsilon, z) - terrainHeight(x - epsilon, z);
    const dz = terrainHeight(x, z + epsilon) - terrainHeight(x, z - epsilon);
    return target.set(-dx, epsilon * 2, -dz).normalize();
}

const TerrainChunk = memo(function TerrainChunk({
    x,
    z,
    waterLevel,
    normalMap,
    aoMap,
}: ChunkCoord & { waterLevel: number; normalMap: Texture; aoMap: Texture }) {
    const geometry = useMemo(() => {
        const value = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
        value.rotateX(-Math.PI / 2);
        const positions = value.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        const originX = x * CHUNK_SIZE;
        const originZ = z * CHUNK_SIZE;
        const sandColor = new Color().setRGB(0.7, 0.55, 0.29);
        const grassColor = new Color().setRGB(0.29, 0.38, 0.13);
        const vertexColor = new Color();
        for (let index = 0; index < positions.count; index += 1) {
            const worldX = originX + positions.getX(index);
            const worldZ = originZ + positions.getZ(index);
            const height = terrainHeight(worldX, worldZ);
            positions.setY(index, height);

            // Revo's terrain blends warm sand into green ground using its
            // authored grass map and noise atlas. Use the same authored colors
            // with a world-height shoreline mask and low-frequency variation.
            const t = Math.max(0, Math.min(1, (height - (waterLevel + 0.2)) / 1.15));
            const grassBlend = t * t * (3 - 2 * t);
            const variation = 0.9 + 0.1 * Math.sin(worldX * 0.31 + Math.sin(worldZ * 0.23));
            vertexColor.lerpColors(sandColor, grassColor, grassBlend).multiplyScalar(variation);
            vertexColor.toArray(colors, index * 3);
        }
        positions.needsUpdate = true;
        value.setAttribute("color", new Float32BufferAttribute(colors, 3));
        value.setAttribute("uv1", value.attributes.uv);
        value.computeVertexNormals();
        return value;
    }, [waterLevel, x, z]);
    return (
        <mesh geometry={geometry} position={[x * CHUNK_SIZE, 0, z * CHUNK_SIZE]} receiveShadow>
            <meshStandardMaterial
                color="#ffffff"
                vertexColors
                normalMap={normalMap}
                normalScale={TERRAIN_NORMAL_SCALE}
                aoMap={aoMap}
                aoMapIntensity={0.82}
                roughness={0.94}
                metalness={0}
            />
        </mesh>
    );
});

function TerrainWindow({ x, z, waterLevel }: ChunkCoord & { waterLevel: number }) {
    const [normalMap, aoMap] = useTexture([ASSETS.groundNormal, ASSETS.groundAo]);
    useMemo(() => {
        for (const texture of [normalMap, aoMap]) {
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.repeat.set(7, 7);
            texture.colorSpace = LinearSRGBColorSpace;
        }
    }, [normalMap, aoMap]);
    const chunks = [];
    for (let chunkZ = z - CHUNK_RADIUS; chunkZ <= z + CHUNK_RADIUS; chunkZ += 1) {
        for (let chunkX = x - CHUNK_RADIUS; chunkX <= x + CHUNK_RADIUS; chunkX += 1) {
            chunks.push(
                <TerrainChunk
                    key={`${chunkX}:${chunkZ}`}
                    x={chunkX}
                    z={chunkZ}
                    waterLevel={waterLevel}
                    normalMap={normalMap}
                    aoMap={aoMap}
                />,
            );
        }
    }
    return <>{chunks}</>;
}

function StreamedTerrain({ waterLevel }: { waterLevel: number }) {
    const runtime = usePlayerRuntime();
    const [center, setCenter] = useState<ChunkCoord>({ x: 0, z: 0 });
    const renderedChunk = useRef<ChunkCoord>({ x: 0, z: 0 });
    useFrame(() => {
        const { x, y: z } = runtime.current.chunk;
        if (renderedChunk.current.x === x && renderedChunk.current.z === z) return;
        renderedChunk.current = { x, z };
        setCenter({ x, z });
    }, -8);
    return <TerrainWindow {...center} waterLevel={waterLevel} />;
}

function RollingBall() {
    const prefabScene = useScene();
    const runtime = usePlayerRuntime();
    const player = runtime.current;
    const keys = useRef(new Set<string>());
    const { position, velocity } = player;
    const normal = useRef(new Vector3());
    const move = useRef(new Vector3());
    const cameraTarget = useRef(new Vector3());
    const cameraPosition = useRef(new Vector3(0, 8, 13));
    const rotationAxis = useRef(new Vector3());
    const rotation = useRef(new Quaternion());
    const ballObject = useRef<Object3D | null>(null);
    const { camera } = useThree();
    const isPlayMode = prefabScene.mode === PrefabEditorMode.Play;

    useLayoutEffect(() => {
        if (!isPlayMode) return;
        const ball = prefabScene.getObject("grassworld-ball");
        if (!ball) return;
        ballObject.current = ball;
        position.copy(ball.position);
        velocity.set(0, 0, 0);
        player.grounded = ball.position.y <= terrainHeight(ball.position.x, ball.position.z) + BALL_RADIUS + 0.001;
        const chunk = {
            x: Math.round(ball.position.x / CHUNK_SIZE),
            z: Math.round(ball.position.z / CHUNK_SIZE),
        };
        player.chunk.set(chunk.x, chunk.z);
    }, [isPlayMode, player, position, prefabScene, velocity]);

    useEffect(() => {
        if (!isPlayMode) {
            ballObject.current = null;
            keys.current.clear();
            return;
        }
        const down = (event: KeyboardEvent) => {
            keys.current.add(event.code);
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
            if (event.code === "KeyF") {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
            }
        };
        const up = (event: KeyboardEvent) => keys.current.delete(event.code);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, [isPlayMode]);

    const update = useCallback((delta: number) => {
        // In Edit mode the PrefabEditor owns navigation and the selected ball's
        // authored transform. Do not consume input or overwrite its camera.
        if (!isPlayMode) return;
        const dt = Math.min(delta, 1 / 30);
        const pressed = keys.current;
        move.current.set(
            (pressed.has("KeyD") || pressed.has("ArrowRight") ? 1 : 0) - (pressed.has("KeyA") || pressed.has("ArrowLeft") ? 1 : 0),
            0,
            (pressed.has("KeyS") || pressed.has("ArrowDown") ? 1 : 0) - (pressed.has("KeyW") || pressed.has("ArrowUp") ? 1 : 0),
        );
        if (move.current.lengthSq() > 0) {
            // Manual-controller equivalent of Revo's rigid-body drive after
            // accounting for the friction we do not simulate here.
            move.current.normalize().multiplyScalar(32 * dt);
            velocity.x += move.current.x;
            velocity.z += move.current.z;
        }
        const drag = Math.exp(-1.8 * dt);
        velocity.x *= drag;
        velocity.z *= drag;
        velocity.y -= 18 * dt;
        if (pressed.has("Space") && player.grounded) {
            velocity.y = 10.5;
            player.grounded = false;
        }
        position.addScaledVector(velocity, dt);
        const floor = terrainHeight(position.x, position.z) + BALL_RADIUS;
        if (position.y <= floor) {
            position.y = floor;
            terrainNormal(position.x, position.z, normal.current);
            if (velocity.y < 0) velocity.y = 0;
            velocity.addScaledVector(normal.current, -normal.current.dot(velocity) * 0.18);
            player.grounded = true;
        } else player.grounded = false;
        const ball = ballObject.current;
        if (ball) {
            ball.position.copy(position);
            const planarSpeed = Math.hypot(velocity.x, velocity.z);
            if (planarSpeed > 0.01) {
                rotationAxis.current.set(velocity.z, 0, -velocity.x).normalize();
                rotation.current.setFromAxisAngle(rotationAxis.current, planarSpeed * dt / BALL_RADIUS);
                ball.quaternion.premultiply(rotation.current);
            }
        }
        const chunkX = Math.round(position.x / CHUNK_SIZE);
        const chunkZ = Math.round(position.z / CHUNK_SIZE);
        if (player.chunk.x !== chunkX || player.chunk.y !== chunkZ) player.chunk.set(chunkX, chunkZ);
        cameraTarget.current.copy(position).y += 1;
        // Revo Player.ts: CAMERA_OFFSET [0, 16, 20], lerp factor 7.5.
        cameraPosition.current.set(position.x, position.y + 16, position.z + 20);
        camera.position.lerp(cameraPosition.current, Math.min(1, 7.5 * dt));
        camera.lookAt(cameraTarget.current);
    }, [camera, isPlayMode, player, position, prefabScene, velocity]);

    // Match Revo's engine order: player state is resolved before vegetation
    // consumes the throttled update event for trails and interaction.
    useFrame((_, delta) => update(delta), -9);
    return null;
}

function Lighting() {
    const runtime = usePlayerRuntime();
    const light = useRef<DirectionalLight>(null);
    const target = useRef<Object3D>(null);
    const frame = useRef(0);
    const { gl } = useThree();
    const directionalColor = useMemo(() => new Color().setRGB(0.85, 0.75, 0.7), []);
    const hemiSkyColor = useMemo(() => new Color().setRGB(0.6, 0.4, 0.5), []);
    const hemiGroundColor = useMemo(() => new Color().setRGB(0.3, 0.2, 0.2), []);

    useEffect(() => {
        gl.toneMappingExposure = 1.5;
        if (light.current && target.current) light.current.target = target.current;
    }, [gl]);

    useFrame(() => {
        frame.current = (frame.current + 1) % 4;
        if (frame.current !== 0 || !light.current || !target.current) return;
        const { x, y, z } = runtime.current.position;
        target.current.position.set(x, y, z);
        light.current.position.set(x + 10, y + 10, z + 10);
    }, -6);

    return (
        <>
            <object3D ref={target} />
            <hemisphereLight args={[hemiSkyColor, hemiGroundColor, 0.3]} position={[10, 10, 10]} />
            <directionalLight
                ref={light}
                castShadow
                color={directionalColor}
                intensity={0.8}
                position={[-8, 10, 10]}
                shadow-mapSize={[64, 64]}
                shadow-intensity={0.85}
                shadow-camera-left={-1}
                shadow-camera-right={1}
                shadow-camera-top={1}
                shadow-camera-bottom={-1}
                shadow-camera-near={0.01}
                shadow-camera-far={30}
                shadow-normalBias={0.1}
                shadow-bias={-0.001}
            />
        </>
    );
}

export default function GrassWorld({ config }: { config: GrassWorldConfig }) {
    return (
        <GrassWorldRuntimeProvider>
            <GrassWorldScene config={config} />
        </GrassWorldRuntimeProvider>
    );
}

function GrassWorldScene({ config }: { config: GrassWorldConfig }) {
    useFrame((_, delta) => GameTime.update(delta), -10);
    return (
        <>
            <fogExp2 attach="fog" args={[FOG_COLOR, 0.004]} />
            <Lighting />
            <Water level={config.waterLevel} size={config.mapSize} />
            <StreamedTerrain waterLevel={config.waterLevel} />
            <Grass
                heightAt={terrainHeight}
                waterLevel={config.waterLevel}
                mapSize={config.mapSize}
                shoreClearance={config.grassShoreClearance}
                transitionWidth={config.grassTransitionWidth}
            />
            <Flowers />
            <RollingBall />
        </>
    );
}
