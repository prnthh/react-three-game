"use client";

import { PrefabEditorMode, registerComponent, type Prefab } from "react-three-game";
import { PrefabEditor } from "react-three-game/editor";
import {
    CrashcatPhysicsComponent,
    CrashcatRuntime,
} from "react-three-game/plugins/crashcat";

import GrassWorld, { terrainHeight } from "./GrassWorld";
import { BASE_PATH } from "../../basePath";
import CameraShadowFollowerComponent from "./components/CameraShadowFollowerComponent";
import {
    BallInputComponent,
    CameraFollowComponent,
    PlayerPositionSyncComponent,
} from "./components/RollingBall";

const grassWorldPrefab: Prefab = {
    id: "grassworld",
    name: "Grass World",
    materials: {
        sky: {
            materialType: "basic",
            color: "#d7ecff",
            side: "BackSide",
            toneMapped: false,
            texture: "/textures/skybox/skybox3.jpg",
        },
        ball: { color: "#d9d5c7", roughness: 0.72, metalness: 0 },
    },
    root: {
        id: "grassworld-root",
        name: "Grass World",
        components: {
            transform: {
                type: "Transform",
                properties: {
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                },
            },
        },
        children: [
            {
                id: "grassworld-environment",
                name: "Grass World Environment",
                components: {
                    environment: {
                        type: "Environment",
                        properties: { intensity: 0.65, resolution: 128 },
                    },
                },
                children: [
                    {
                        id: "grassworld-sky",
                        name: "Muted Meadow Sky",
                        components: {
                            transform: {
                                type: "Transform",
                                properties: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                            },
                            mesh: {
                                type: "Mesh",
                                properties: { castShadow: false, receiveShadow: false },
                            },
                            geometry: {
                                type: "Geometry",
                                properties: { geometryType: "sphere", args: [170, 24, 12] },
                            },
                            material: {
                                type: "Material",
                                properties: { materialId: "sky" },
                            },
                        },
                    },
                ],
            },
            {
                id: "grassworld-ball",
                name: "Player Ball",
                components: {
                    transform: {
                        type: "Transform",
                        properties: {
                            position: [-18, terrainHeight(-18, 0) + 0.5, 0],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1],
                        },
                    },
                    mesh: { type: "Mesh", properties: {} },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "sphere", args: [0.5, 24, 16] },
                    },
                    material: {
                        type: "Material",
                        properties: { materialId: "ball" },
                    },
                    input: {
                        type: "GrassWorldBallInput",
                        properties: {
                            acceleration: 32,
                            drag: 1.8,
                            jumpVelocity: 10.5,
                        },
                    },
                    playerPositionSync: {
                        type: "GrassWorldPlayerPositionSync",
                        properties: {},
                    },
                    crashcatPhysics: {
                        type: "CrashcatPhysics",
                        properties: {
                            type: "dynamic",
                            colliders: "ball",
                            friction: 0.8,
                            restitution: 0.05,
                        },
                    },
                },
            },
            {
                id: "grassworld-player-camera",
                name: "Player Camera",
                components: {
                    transform: {
                        type: "Transform",
                        properties: {
                            position: [-18, terrainHeight(-18, 0) + 16, 20],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1],
                        },
                    },
                    camera: {
                        type: "Camera",
                        properties: {
                            projection: "perspective",
                            fov: 45,
                            near: 0.01,
                            far: 150,
                        },
                    },
                    follow: {
                        type: "GrassWorldCameraFollow",
                        properties: {
                            targetId: "grassworld-ball",
                            positionOffset: [0, 16, 20],
                            targetOffset: [0, 1, 0],
                            followSpeed: 7.5,
                        },
                    },
                },
            },
            {
                id: "grassworld-hemisphere-fill",
                name: "Meadow Hemisphere Fill",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [10, 10, 10] },
                    },
                    hemisphereLight: {
                        type: "HemisphereLight",
                        properties: {
                            skyColor: "#cbaabc",
                            groundColor: "#957c7c",
                            intensity: 0.3,
                        },
                    },
                },
            },
            {
                id: "grassworld-directional-sun",
                name: "Meadow Sun",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [10, 10, 10] },
                    },
                    directionalLight: {
                        type: "DirectionalLight",
                        properties: {
                            color: "#ede1da",
                            intensity: 0.8,
                            targetOffset: [-10, -10, -10],
                            castShadow: true,
                            shadowMapSize: 64,
                            shadowIntensity: 0.85,
                            shadowCameraLeft: -1,
                            shadowCameraRight: 1,
                            shadowCameraTop: 1,
                            shadowCameraBottom: -1,
                            shadowCameraNear: 0.01,
                            shadowCameraFar: 30,
                            shadowNormalBias: 0.1,
                            shadowBias: -0.001,
                        },
                    },
                    cameraShadowFollower: {
                        type: "CameraShadowFollower",
                        properties: {
                            interval: 0.1,
                            offset: [10, -6, -10],
                        },
                    },
                },
            },
        ],
    },
};

const grassWorldConfig = {
    mapSize: 512,
    waterLevel: -0.7,
    grassShoreClearance: 0.45,
    grassTransitionWidth: 0.55,
    terrainChunkSize: 24,
    terrainChunkRadius: 2,
};

export default function GrassWorldDemo() {
    registerComponent(CrashcatPhysicsComponent);
    registerComponent(CameraShadowFollowerComponent);
    registerComponent(BallInputComponent);
    registerComponent(PlayerPositionSyncComponent);
    registerComponent(CameraFollowComponent);

    return (
        <main className="h-screen w-screen bg-sky-300">
            <PrefabEditor
                basePath={BASE_PATH}
                prefab={grassWorldPrefab}
                mode={PrefabEditorMode.Play}
                enableWindowDrop={false}
                canvasProps={{
                    // This scene is fill-rate heavy (dense alpha-tested grass plus
                    // viewport/depth water), so keep its render target at CSS DPR.
                    dpr: 1,
                    // Water samples a single-sample postprocessing depth target.
                    // This demo renders directly to the canvas, so canvas MSAA must
                    // be disabled to keep viewportDepthTexture sample counts valid.
                    glConfig: {
                        antialias: false,
                        powerPreference: "high-performance",
                        stencil: false,
                        depth: true,
                    },
                    rendererConfig: { toneMappingExposure: 1.5 },
                }}
            >
                <CrashcatRuntime>
                    <GrassWorld config={grassWorldConfig} />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}
