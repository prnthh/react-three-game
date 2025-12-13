"use client";

import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";

export default function Home() {
    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas>
                <Physics>
                    <ambientLight intensity={0.8} />
                    <PrefabRoot
                        data={{
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
                        }} />
                </Physics>
            </GameCanvas>
        </main>
    );
} 