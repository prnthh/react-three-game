"use client";

import { useCallback, useRef } from "react";
import { PrefabEditor, PrefabEditorMode, useGameEvent } from "react-three-game";
import type { PrefabEditorRef } from "react-three-game";
import { Quaternion, Vector3 } from "three";

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
                            sound: {
                                type: "Sound",
                                properties: {
                                    eventName: TARGET_HIT_EVENT,
                                    clips: TARGET_HIT_SOUNDS,
                                    clipMode: "random",
                                    positional: true,
                                    refDistance: 2.2,
                                    maxDistance: 18,
                                    rolloffFactor: 1.2,
                                    randomizePitch: true,
                                    minPitch: 0.94,
                                    maxPitch: 1.08,
                                    volume: 0.8,
                                }
                            },
                            physics: {
                                type: "Physics",
                                properties: {
                                    type: "fixed",
                                    colliders: "cuboid",
                                    collisionEnterEventName: TARGET_HIT_EVENT,
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
                        properties: { geometryType: "cylinder", args: [0.45, 0.28, 1.8, 24] }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#f97316", metalness: 0.2, roughness: 0.7 }
                    },
                    click: {
                        type: "Click",
                        properties: { eventName: CANNON_FIRE_EVENT }
                    },
                    sound: {
                        type: "Sound",
                        properties: {
                            path: CANNON_FIRE_SOUND,
                            eventName: CANNON_FIRE_EVENT,
                            positional: true,
                            refDistance: 3,
                            maxDistance: 26,
                            rolloffFactor: 1,
                            volume: 0.9,
                        }
                    }
                }
            }
        ]
    }
};

function fireProjectileFromCannon(editor: PrefabEditorRef | null, barrelEntityId = CANNON_BARREL_ID) {
    const barrelObject = editor?.scene.find(barrelEntityId)?.object
        ?? editor?.scene.find(CANNON_BARREL_ID)?.object;
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

    editor.scene.create("projectile", {
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
    });
}

function updateTargetColor(editor: PrefabEditorRef | null, color: string) {
    if (!editor) return;
    editor.scene.find(TARGET_ID)?.getComponent("Material")?.set("color", color);
}

function CannonController({ onFire }: { onFire: (barrelEntityId: string) => void }) {
    useGameEvent(CANNON_FIRE_EVENT, (payload) => {
        if (typeof payload.sourceEntityId !== 'string') return;
        onFire(payload.sourceEntityId);
    }, [onFire]);

    return null;
}

function TargetController({ onTargetColorChange }: { onTargetColorChange: (color: string) => void }) {
    useGameEvent(TARGET_HIT_EVENT, (payload) => {
        if (payload.sourceEntityId !== TARGET_ID) return;

        onTargetColorChange(TARGET_HIT_COLOR);
    }, [onTargetColorChange]);

    useGameEvent(TARGET_RESET_EVENT, (payload) => {
        if (payload.sourceEntityId !== TARGET_ID) return;

        onTargetColorChange(TARGET_IDLE_COLOR);
    }, [onTargetColorChange]);

    return null;
}

export default function PhysicsDemo() {
    const editorRef = useRef<PrefabEditorRef>(null);

    const fireCannon = useCallback((barrelEntityId: string) => {
        fireProjectileFromCannon(editorRef.current, barrelEntityId);
    }, []);

    const handleTargetColorChange = useCallback((color: string) => {
        updateTargetColor(editorRef.current, color);
    }, []);

    return (
        <main className="flex h-screen w-screen">
            <PrefabEditor ref={editorRef} initialPrefab={prefab} mode={PrefabEditorMode.Play}>
                <CannonController onFire={fireCannon} />
                <TargetController onTargetColorChange={handleTargetColorChange} />
                <ambientLight intensity={1.5} />
            </PrefabEditor>
        </main>
    );
}
