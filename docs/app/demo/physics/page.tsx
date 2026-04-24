"use client";

import { useEffect, useRef } from "react";
import { gameEvents, PrefabEditor, PrefabEditorMode, registerComponent, soundManager } from "react-three-game";
import type { PrefabEditorRef } from "react-three-game";
import { Quaternion, Vector3 } from "three";
import CrashcatPhysicsComponent from "@/app/components/CrashcatPhysicsComponent";
import { CrashcatRuntime } from "../../components/CrashcatRuntime";
import CannonBarrelSwayComponent from "./CannonBarrelSwayComponent";

const CANNON_BARREL_LENGTH = 1.8;
const PROJECTILE_SPEED = 22;
const CANNON_BARREL_ID = "cannon-barrel";
const TARGET_ID = "wall-target";
const TARGET_IDLE_COLOR = "#22c55e";
const TARGET_HIT_COLOR = "#ef4444";
const CANNON_FIRE_SOUND = "/sound/explode.mp3";
const TARGET_HIT_SOUNDS = ["/sound/hit.mp3", "/sound/hit2.mp3"];
const CANNON_FIRE_EVENT = "cannon:fire";
const TARGET_HIT_EVENT = "target:hit";
const TARGET_RESET_EVENT = "target:reset";

registerComponent(CannonBarrelSwayComponent);
registerComponent(CrashcatPhysicsComponent);

const prefab = {
    id: "scene",
    name: "Cannon Demo",
    root: {
        id: "root",
        components: {
            transform: { type: "Transform", properties: { position: [0, 0, 0] } },
        },
        children: [
            {
                id: "ground",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [0, -0.15, 0] }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "box", args: [18, 0.3, 28] }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#444444" }
                    },
                    crashcatPhysics: {
                        type: "CrashcatPhysics",
                        properties: { shape: "autoBox", motionType: "static" }
                    }
                }
            },
            {
                id: "back-wall",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [0, 2, -8] }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "box", args: [12, 4, 0.6] }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#7c3aed" }
                    },
                    crashcatPhysics: {
                        type: "CrashcatPhysics",
                        properties: { shape: "autoBox", motionType: "static" }
                    }
                },
                children: [
                    {
                        id: "wall-target",
                        components: {
                            transform: {
                                type: "Transform",
                                properties: { position: [0, 0, 0.36], rotation: [Math.PI / 2, 0, 0] }
                            },
                            geometry: {
                                type: "Geometry",
                                properties: { geometryType: "cylinder", args: [0.9, 0.9, 0.2, 32] }
                            },
                            material: {
                                type: "Material",
                                properties: { color: "#22c55e", opacity: 0.9, transparent: true }
                            },
                            crashcatPhysics: {
                                type: "CrashcatPhysics",
                                properties: {
                                    shape: "autoBox",
                                    motionType: "static",
                                    sensor: true,
                                    collisionEnter: TARGET_HIT_EVENT,
                                    collisionExit: TARGET_RESET_EVENT,
                                }
                            }
                        }
                    }
                ]
            },
            {
                id: "cannon-base",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [0, 0.35, 3.5] }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "box", args: [1.6, 0.7, 1.6] }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#1f2937" }
                    }
                }
            },
            {
                id: "cannon-barrel",
                components: {
                    transform: {
                        type: "Transform",
                        properties: {
                            position: [0, 1.2, 3.5],
                            rotation: [Math.PI / 1.8, 0, 0],
                            scale: [1, 1, 1]
                        }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: {
                            geometryType: "cylinder",
                            args: [0.45, 0.28, 1.8, 24],
                            emitClickEvent: true,
                            clickEventName: CANNON_FIRE_EVENT,
                        }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#f97316", metalness: 0.2, roughness: 0.7 }
                    },
                    cannonBarrelSway: {
                        type: "CannonBarrelSway",
                        properties: {
                            yawAmplitude: 0.38,
                            pitchAmplitude: 0.14,
                            speed: 1.8,
                        }
                    }
                }
            }
        ]
    }
};

function createProjectileNode(spawnPosition: Vector3, launchVelocity: Vector3) {
    return {
        id: crypto.randomUUID(),
        name: "projectile",
        components: {
            transform: {
                type: "Transform",
                properties: {
                    position: [spawnPosition.x, spawnPosition.y, spawnPosition.z],
                },
            },
            geometry: { type: "Geometry", properties: { geometryType: "sphere", args: [0.28, 24, 24] } },
            material: { type: "Material", properties: { color: "#f8fafc" } },
            crashcatPhysics: {
                type: "CrashcatPhysics",
                properties: {
                    shape: "sphere",
                    motionType: "dynamic",
                    motionQuality: "linearCast",
                    radius: 0.28,
                    restitution: 0.3,
                    friction: 0.6,
                    linearVelocity: [launchVelocity.x, launchVelocity.y, launchVelocity.z],
                },
            },
        },
    };
}

function fireProjectileFromCannon(editor: PrefabEditorRef | null, barrelEntityId = CANNON_BARREL_ID) {
    const barrelObject = editor?.getNodeObject(barrelEntityId);
    if (!barrelObject || !editor) return;

    barrelObject.updateWorldMatrix(true, false);

    const worldPosition = new Vector3();
    const worldQuaternion = new Quaternion();
    const direction = new Vector3(0, -1, 0);

    barrelObject.getWorldPosition(worldPosition);
    barrelObject.getWorldQuaternion(worldQuaternion);
    direction.applyQuaternion(worldQuaternion).normalize();

    const muzzleOffset = direction.clone().multiplyScalar(CANNON_BARREL_LENGTH * 0.65);
    const spawnPosition = worldPosition.clone().add(muzzleOffset);
    const launchVelocity = direction.multiplyScalar(PROJECTILE_SPEED);

    editor.addNode(createProjectileNode(spawnPosition, launchVelocity));
}

export default function PhysicsDemo() {
    const editorRef = useRef<PrefabEditorRef>(null);

    useEffect(() => {
        const setTargetColor = (color: string) => {
            const material = (editorRef.current?.getNodeObject(TARGET_ID) as any)?.material;
            if (!material?.color) return;
            material.color.set(color);
        };

        setTargetColor(TARGET_IDLE_COLOR);

        const stopFire = gameEvents.on(CANNON_FIRE_EVENT, (payload: unknown) => {
            const detail = payload as { nodeId?: string; sourceEntityId?: string } | undefined;
            const barrelId = typeof detail?.sourceEntityId === "string"
                ? detail.sourceEntityId
                : typeof detail?.nodeId === "string"
                    ? detail.nodeId
                    : CANNON_BARREL_ID;
            fireProjectileFromCannon(editorRef.current, barrelId);
            void soundManager.play(CANNON_FIRE_SOUND, { volume: 0.9 });
        });

        const stopTargetHit = gameEvents.on(TARGET_HIT_EVENT, () => {
            setTargetColor(TARGET_HIT_COLOR);
            const clip = TARGET_HIT_SOUNDS[Math.floor(Math.random() * TARGET_HIT_SOUNDS.length)];
            void soundManager.play(clip, {
                volume: 0.8,
                pitch: 0.94 + Math.random() * 0.14,
            });
        });

        const stopTargetReset = gameEvents.on(TARGET_RESET_EVENT, () => {
            setTargetColor(TARGET_IDLE_COLOR);
        });

        return () => {
            stopFire();
            stopTargetHit();
            stopTargetReset();
        };
    }, []);

    return (
        <main className="flex h-screen w-screen flex-col">
            <PrefabEditor ref={editorRef} initialPrefab={prefab} mode={PrefabEditorMode.Play}>
                <CrashcatRuntime editorRef={editorRef} debug />
                <ambientLight intensity={1.5} />
            </PrefabEditor>
        </main>
    );
}
