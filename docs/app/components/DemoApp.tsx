"use client";

import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";
import { useState } from "react";

export default function DemoApp() {
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
                                texture: "/textures/GreyboxTextures/greybox_light_grid.png",
                                repeat: true,
                                repeatCount: [25, 25]
                            }
                        },
                    }
                }
            ]
        }
    });

    return (
        <div className="absolute top-0 w-screen h-screen -z-1">
            <GameCanvas>
                <Physics>
                    <ambientLight intensity={0.8} />
                    <PrefabRoot
                        data={selectedPrefab} />
                </Physics>
            </GameCanvas>
        </div>
    );
} 