"use client";

import { useEffect } from "react";
import { PrefabEditor, PrefabEditorMode, registerComponent } from "react-three-game/editor";
import type { Prefab } from "react-three-game/editor";
import {
    CrashcatRagdollComponent,
    CrashcatRuntime,
    createStaticBoxBody,
    useCrashcat,
} from "react-three-game/plugins/crashcat";
import { rigidBody, type RigidBody } from "crashcat";
import { BASE_PATH } from "../../basePath";

registerComponent(CrashcatRagdollComponent);

const ragdollDemoPrefab: Prefab = {
    id: "ragdoll-demo",
    name: "Ragdoll Demo",
    root: {
        id: "ragdoll-root",
        name: "Ragdoll Root",
        children: [
            {
                id: "ragdoll-orange",
                name: "Orange Ragdoll",
                components: {
                    transform: {
                        type: "Transform",
                        properties: {
                            position: [-3.2, 3.4, 0],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1],
                        },
                    },
                    crashcatRagdoll: {
                        type: "CrashcatRagdoll",
                        properties: {
                            color: "#f97316",
                            initialLinearVelocity: [1.2, 1.5, 0],
                            initialAngularVelocity: [0, 0, 8],
                        },
                    },
                },
            },
            {
                id: "ragdoll-blue",
                name: "Blue Ragdoll",
                components: {
                    transform: {
                        type: "Transform",
                        properties: {
                            position: [0, 5.7, -0.25],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1],
                        },
                    },
                    crashcatRagdoll: {
                        type: "CrashcatRagdoll",
                        properties: {
                            color: "#38bdf8",
                            initialLinearVelocity: [0, 0.4, 0.6],
                            initialAngularVelocity: [0, 5, -6],
                        },
                    },
                },
            },
            {
                id: "ragdoll-lime",
                name: "Lime Ragdoll",
                components: {
                    transform: {
                        type: "Transform",
                        properties: {
                            position: [3.2, 8, 0.3],
                            rotation: [0, 0, 0],
                            scale: [1, 1, 1],
                        },
                    },
                    crashcatRagdoll: {
                        type: "CrashcatRagdoll",
                        properties: {
                            color: "#a3e635",
                            initialLinearVelocity: [-1.1, 0.6, -0.2],
                            initialAngularVelocity: [4, 0, 6],
                        },
                    },
                },
            },
        ],
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
    },
};

function StaticPhysicsBox({
    position,
    size,
}: {
    position: [number, number, number];
    size: [number, number, number];
}) {
    const api = useCrashcat();

    useEffect(() => {
        if (!api) return undefined;

        const body: RigidBody = createStaticBoxBody(
            api.world,
            api.staticObjectLayer,
            [size[0] / 2, size[1] / 2, size[2] / 2],
            position,
        );

        return () => {
            rigidBody.remove(api.world, body);
        };
    }, [api, position, size]);

    return (
        <mesh receiveShadow position={position}>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.02} />
        </mesh>
    );
}

function DemoBindings() {
    useEffect(() => {
        const windowWithDebug = window as Window & {
            render_game_to_text?: () => string;
        };

        windowWithDebug.render_game_to_text = () => JSON.stringify({
            scene: "crashcat-ragdoll-demo",
            ragdolls: 3,
            controls: "prefab editor camera",
            coordinateSystem: "Three.js world coordinates, y is up",
        });

        return () => {
            delete windowWithDebug.render_game_to_text;
        };
    }, []);

    return null;
}

export default function RagdollDemo() {
    return (
        <main className="h-screen w-screen bg-slate-950">
            <PrefabEditor basePath={BASE_PATH} initialPrefab={ragdollDemoPrefab} mode={PrefabEditorMode.Play}>
                <CrashcatRuntime debug />
                <DemoBindings />
                <ambientLight intensity={0.65} />
                <directionalLight
                    castShadow
                    intensity={2.5}
                    position={[6, 10, 5]}
                    shadow-mapSize={[2048, 2048]}
                />
                <StaticPhysicsBox position={[0, -0.55, 0]} size={[16, 1, 14]} />
            </PrefabEditor>
        </main>
    );
}
