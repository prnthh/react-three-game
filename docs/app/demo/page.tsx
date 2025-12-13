"use client";

import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot } from "react-three-game";

export default function Home() {
    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas>
                <Physics>
                    <ambientLight intensity={0.8} />
                    <PrefabRoot data={{
                        root: {
                            id: "cube",
                            components: {
                                transform: { type: "Transform", properties: { position: [0, 1, 0] } },
                                geometry: { type: "Geometry", properties: { geometryType: "box" } },
                                material: { type: "Material", properties: { color: "green" } },
                                physics: { type: "Physics", properties: { type: "dynamic" } }
                            }
                        }
                    }} />
                </Physics>
            </GameCanvas>
        </main>
    );
} 