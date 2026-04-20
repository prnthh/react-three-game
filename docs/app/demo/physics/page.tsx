"use client";

import { useEffect, useRef } from "react";
import { gameEvents, PrefabEditor, PrefabEditorMode, registerComponent, soundManager } from "react-three-game";
import type { GameObject, PrefabEditorRef } from "react-three-game";
import { Quaternion, Vector3 } from "three";
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

const prefab = {
    id: "scene",
    name: "Cannon Demo",
    root: {
        id: "root",
        components: {
            transform: { type: "Transform", properties: { position: [0, 0, 0] } }
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
                    physics: {
                        type: "Physics",
                        properties: { type: "fixed" }
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
                    physics: {
                        type: "Physics",
                        properties: { type: "fixed" }
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
                            physics: {
                                type: "Physics",
                                properties: {
                                    type: "fixed",
                                    colliders: "cuboid",
                                    emitCollisionEnterEvent: true,
                                    collisionEnterEventName: TARGET_HIT_EVENT,
                                    emitCollisionExitEvent: true,
                                    collisionExitEventName: TARGET_RESET_EVENT,
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

function fireProjectileFromCannon(editor: PrefabEditorRef | null, barrelEntityId = CANNON_BARREL_ID) {
    const barrelObject = editor?.getObject(barrelEntityId)
        ?? editor?.getObject(CANNON_BARREL_ID);
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

    editor.addNode({
        id: crypto.randomUUID(),
        name: "projectile",
        components: {
            transform: {
                type: 'Transform', properties: {
                    position: [spawnPosition.x, spawnPosition.y, spawnPosition.z],
                },
            },
            geometry: { type: 'Geometry', properties: { geometryType: 'sphere', args: [0.28, 24, 24] } },
            material: { type: 'Material', properties: { color: '#f8fafc' } },
            physics: {
                type: 'Physics', properties: {
                    type: 'dynamic', colliders: 'ball', restitution: 0.3, friction: 0.6,
                    linearVelocity: [launchVelocity.x, launchVelocity.y, launchVelocity.z],
                },
            },
        },
    });
}

function updateTargetColor(editor: PrefabEditorRef | null, color: string) {
    if (!editor) return;

    editor.store.getState().updateNode(TARGET_ID, (node: GameObject) => ({
        ...node,
        components: {
            ...node.components,
            material: {
                type: "Material",
                properties: {
                    ...node.components?.material?.properties,
                    color,
                },
            },
        },
    }));
}

export default function PhysicsDemo() {
    const editorRef = useRef<PrefabEditorRef>(null);

    useEffect(() => {
        updateTargetColor(editorRef.current, TARGET_IDLE_COLOR);

        const stopFire = gameEvents.on(CANNON_FIRE_EVENT, (payload: { nodeId?: string; sourceEntityId?: string } | unknown) => {
            const detail = payload as { nodeId?: string; sourceEntityId?: string };
            const barrelEntityId = typeof detail?.sourceEntityId === "string"
                ? detail.sourceEntityId
                : typeof detail?.nodeId === "string"
                    ? detail.nodeId
                : CANNON_BARREL_ID;

            fireProjectileFromCannon(editorRef.current, barrelEntityId);
            void soundManager.play(CANNON_FIRE_SOUND, { volume: 0.9 });
        });

        const stopTargetHit = gameEvents.on(TARGET_HIT_EVENT, () => {
            updateTargetColor(editorRef.current, TARGET_HIT_COLOR);
            const clip = TARGET_HIT_SOUNDS[Math.floor(Math.random() * TARGET_HIT_SOUNDS.length)];
            void soundManager.play(clip, {
                volume: 0.8,
                pitch: 0.94 + Math.random() * 0.14,
            });
        });

        const stopTargetReset = gameEvents.on(TARGET_RESET_EVENT, () => {
            updateTargetColor(editorRef.current, TARGET_IDLE_COLOR);
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
                <ambientLight intensity={1.5} />
            </PrefabEditor>
        </main>
    );
}
