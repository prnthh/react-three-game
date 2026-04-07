"use client";

import { useCallback, useRef } from "react";
import { insertNode, PrefabEditor, updateNodeById, useGameEvent } from "react-three-game";
import type { GameObject, PrefabEditorRef } from "react-three-game";
import { Quaternion, Vector3 } from "three";

const CANNON_BARREL_LENGTH = 1.8;
const PROJECTILE_SPEED = 22;
const CANNON_BARREL_ID = "cannon-barrel";
const TARGET_ID = "wall-target";
const TARGET_IDLE_COLOR = "#22c55e";
const TARGET_HIT_COLOR = "#ef4444";

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
                                properties: { type: "fixed", sensor: true, colliders: "cuboid" }
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
                        properties: {}
                    }
                }
            }
        ]
    }
};

function createProjectileNode(position: [number, number, number], velocity: [number, number, number]): GameObject {
    return {
        id: `projectile-${crypto.randomUUID()}`,
        components: {
            transform: {
                type: 'Transform',
                properties: {
                    position,
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                },
            },
            geometry: {
                type: 'Geometry',
                properties: { geometryType: 'sphere', args: [0.28, 24, 24] },
            },
            material: {
                type: 'Material',
                properties: { color: '#f8fafc' },
            },
            physics: {
                type: 'Physics',
                properties: {
                    type: 'dynamic',
                    colliders: 'ball',
                    restitution: 0.3,
                    friction: 0.6,
                    linearVelocity: velocity,
                },
            },
        },
    };
}

function createProjectileFromCannon(editor: PrefabEditorRef | null, barrelEntityId = CANNON_BARREL_ID): GameObject | null {
    const barrelObject = editor?.rootRef.current?.getObject(barrelEntityId)
        ?? editor?.rootRef.current?.getObject(CANNON_BARREL_ID);
    if (!barrelObject) return null;

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

    return createProjectileNode(
        [spawnPosition.x, spawnPosition.y, spawnPosition.z],
        [launchVelocity.x, launchVelocity.y, launchVelocity.z]
    );
}

function updateTargetColor(editor: PrefabEditorRef | null, color: string) {
    if (!editor) return;

    const currentPrefab = editor.prefab;
    const root = updateNodeById(currentPrefab.root, TARGET_ID, (node) => ({
        ...node,
        components: {
            ...node.components,
            material: {
                ...node.components?.material,
                type: 'Material',
                properties: {
                    ...node.components?.material?.properties,
                    color,
                },
            },
        },
    }));

    if (root !== currentPrefab.root) {
        editor.setPrefab({ ...currentPrefab, root });
    }
}

function CannonController({ editorRef, onFire }: { editorRef: React.RefObject<PrefabEditorRef | null>; onFire: (barrelEntityId: string) => void }) {
    useGameEvent('click', (payload) => {
        onFire(payload.sourceEntityId);
    }, [onFire]);

    return null;
}

function TargetController({ onTargetColorChange }: { onTargetColorChange: (color: string) => void }) {
    useGameEvent('sensor:enter', (payload) => {
        if (payload.sourceEntityId !== TARGET_ID) return;

        onTargetColorChange(TARGET_HIT_COLOR);
    }, [onTargetColorChange]);

    useGameEvent('sensor:exit', (payload) => {
        if (payload.sourceEntityId !== TARGET_ID) return;

        onTargetColorChange(TARGET_IDLE_COLOR);
    }, [onTargetColorChange]);

    return null;
}

export default function PhysicsDemo() {
    const editorRef = useRef<PrefabEditorRef>(null);

    const fireCannon = useCallback((barrelEntityId: string) => {
        const editor = editorRef.current;
        const projectile = createProjectileFromCannon(editorRef.current, barrelEntityId);
        if (!projectile || !editor) return;

        editor.setPrefab({
            ...editor.prefab,
            root: insertNode(editor.prefab.root, projectile),
        });
    }, []);

    const handleTargetColorChange = useCallback((color: string) => {
        updateTargetColor(editorRef.current, color);
    }, []);

    return (
        <main className="flex h-screen w-screen">
            <PrefabEditor ref={editorRef} initialPrefab={prefab}>
                <CannonController editorRef={editorRef} onFire={fireCannon} />
                <TargetController onTargetColorChange={handleTargetColorChange} />
            </PrefabEditor>
        </main>
    );
}
