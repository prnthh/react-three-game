"use client";

import { PrefabEditor, PrefabEditorMode, registerComponent, type Prefab } from "react-three-game/editor";
import {
    CrashcatPhysicsComponent,
    CrashcatRuntime,
} from "react-three-game/plugins/crashcat";

import GrassWorld, { terrainHeight } from "./GrassWorld";
import { BASE_PATH } from "../../basePath";

registerComponent(CrashcatPhysicsComponent);

const grassWorldPrefab: Prefab = {
    id: "grassworld",
    name: "Grass World",
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
                            geometry: {
                                type: "Geometry",
                                properties: { geometryType: "sphere", args: [170, 24, 12], castShadow: false, receiveShadow: false },
                            },
                            material: {
                                type: "Material",
                                properties: {
                                    materialType: "basic",
                                    color: "#d7ecff",
                                    side: "BackSide",
                                    toneMapped: false,
                                    texture: "/textures/skybox/skybox3.jpg",
                                    repeat: false,
                                },
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
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "sphere", args: [0.5, 24, 16] },
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#d9d5c7", roughness: 0.72, metalness: 0 },
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
        ],
    },
};

const grassWorldConfig = {
    mapSize: 512,
    waterLevel: -0.7,
    grassShoreClearance: 0.45,
    grassTransitionWidth: 0.55,
};

export default function GrassWorldDemo() {
    return (
        <main className="h-screen w-screen bg-sky-300">
            <PrefabEditor
                basePath={BASE_PATH}
                initialPrefab={grassWorldPrefab}
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
                    camera: { position: [0, 16, 20], fov: 45, near: 0.01, far: 150 },
                }}
            >
                <CrashcatRuntime>
                    <GrassWorld config={grassWorldConfig} />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}
