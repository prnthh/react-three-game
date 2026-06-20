"use client";

import { GameCanvas, PrefabRoot } from "react-three-game/viewer";
import { useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { BASE_PATH, withBasePath } from "../basePath";
import type { Prefab } from "react-three-game/viewer";
import gameLevel from "../../public/prefabs/game-level.json";

export default function Home() {
    const [selectedScene, setSelectedScene] = useState<Prefab>(gameLevel as Prefab);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas camera={{ position: [0, 1, 10] }}>
                <ambientLight intensity={0.8} />
                <PrefabRoot
                    basePath={BASE_PATH}
                    data={selectedScene} />
                <OrbitControls />
            </GameCanvas>

            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <ViewerToolbar setSelectedPrefab={setSelectedScene} />
            </div>
        </main>
    );
}

function ViewerToolbar({ setSelectedPrefab }: { setSelectedPrefab: (prefab: Prefab) => void }) {
    return (
        <select className="bg-white text-black" onChange={(event) => {
            if (!event.target.value) return;
            fetch(withBasePath(`/prefabs/${event.target.value}.json`)).then(response => response.json()).then(setSelectedPrefab);
        }}>
            <option value="">— select prefab —</option>
            {["game-level", "prefab"].map((prefabName) => (
                <option key={prefabName} value={prefabName}>{prefabName}</option>
            ))}
        </select>
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
