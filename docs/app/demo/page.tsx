"use client";

import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";
import { useState } from "react";

export default function Home() {
    const [selectedPrefab, setSelectedPrefab] = useState<any>({
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
                                color: "white",
                                texture: "/textures/GreyboxTextures/greybox_light_grid.png",
                                repeat: true,
                                repeatCount: [25, 25]
                            }
                        },
                        physics: {
                            type: "Physics",
                            properties: {
                                type: "fixed"
                            }
                        }
                    }
                }
            ]
        }
    });

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas>
                <Physics>
                    <ambientLight intensity={0.8} />
                    <PrefabRoot
                        data={selectedPrefab} />
                </Physics>
            </GameCanvas>

            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <select className="bg-white text-black" onChange={(e) => {
                    import(`../samples/${e.target.value}`).then((mod) => {
                        setSelectedPrefab(mod.default);
                    });
                }}>
                    {['test', 'floor', 'killbox'].map((prefabName) => (
                        <option key={prefabName} value={prefabName}>{prefabName} prefab</option>
                    ))}
                </select>

            </div>
        </main>
    );
} 