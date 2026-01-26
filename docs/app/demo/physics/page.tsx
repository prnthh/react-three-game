"use client";

import { RigidBody } from "@react-three/rapier";
import { PrefabEditor, useGameEvent } from "react-three-game";

const prefab = {
    id: "scene",
    name: "Sensor Demo",
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
                        properties: { position: [0, -0.5, 0] }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "box", args: [10, 1, 10] }
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
                id: "sensor-cube",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [0, 0.5, 0] }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "box", args: [2, 1, 2] }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#00ff88", opacity: 0.5, transparent: true }
                    },
                    physics: {
                        type: "Physics",
                        properties: { type: "fixed", sensor: true }
                    }
                }
            },
            {
                id: "ball",
                components: {
                    transform: {
                        type: "Transform",
                        properties: { position: [0, 5, 0] }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: { geometryType: "sphere", args: [0.5, 32, 32] }
                    },
                    material: {
                        type: "Material",
                        properties: { color: "#ff4444" }
                    },
                    physics: {
                        type: "Physics",
                        properties: { type: "dynamic", restitution: 0.8 }
                    }
                }
            }
        ]
    }
};

function SensorLogger() {
    useGameEvent('sensor:enter', (payload) => {
        console.log('🟢 Sensor entered!', {
            sensor: payload.sourceEntityId,
            enteredBy: payload.targetEntityId
        });
    }, []);

    useGameEvent('sensor:exit', (payload) => {
        console.log('🔴 Sensor exited!', {
            sensor: payload.sourceEntityId,
            exitedBy: payload.targetEntityId
        });
    }, []);

    return null;
}

// Custom R3F RigidBody - demonstrates composition with prefab entities
function ExternalBall() {
    return (
        <RigidBody
            position={[2, 8, 0]}
            type="dynamic"
            restitution={0.9}
            userData={{ entityId: 'external-ball' }}
        >
            <mesh castShadow>
                <sphereGeometry args={[0.4, 32, 32]} />
                <meshStandardMaterial color="#4488ff" />
            </mesh>
        </RigidBody>
    );
}

export default function PhysicsDemo() {
    return (
        <main className="flex h-screen w-screen">
            <PrefabEditor initialPrefab={prefab}>
                <SensorLogger />
                <ExternalBall />
            </PrefabEditor>
        </main>
    );
}
