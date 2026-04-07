"use client";

import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";
import { useState } from "react";
import { Toolbar } from "../editor/page";
import { OrbitControls } from "@react-three/drei";

export default function Home() {
    const [selectedPrefab, setSelectedPrefab] = useState<any>(inlinePrefab);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas camera={{ position: [0, 1, 10] }}>
                <Physics>
                    <ambientLight intensity={0.8} />
                    <PrefabRoot
                        data={selectedPrefab} />
                </Physics>
                <OrbitControls />
            </GameCanvas>

            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <Toolbar setSelectedPrefab={setSelectedPrefab} />
            </div>
        </main>
    );
}

const inlinePrefab = {
    id: "scene",
    name: "scene",
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
                        properties: {
                            position: [0, 0, 0],
                            rotation: [-1.57, 0, 0],
                            scale: [1, 1, 1]
                        }
                    },
                    geometry: {
                        type: "Geometry",
                        properties: {
                            geometryType: "plane",
                            args: [50, 50]
                        }
                    },
                    material: {
                        type: "Material",
                        properties: {
                            texture: "/textures/proto32/grey.png",
                            repeat: true,
                            repeatCount: [25, 25]
                        }
                    },
                }
            }
        ]
    }
}