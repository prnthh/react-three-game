"use client";

import { GameCanvas, PrefabRoot, registerComponent } from "react-three-game/viewer";
import { useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { BASE_PATH } from "../basePath";
import type { Prefab } from "react-three-game/core";

import PrefabSelector from "../components/PrefabSelector";
import gameLevel from "../../public/prefabs/game-level.json";
import InteriorMapComponent from "../components/InteriorMapComponent";

export default function Home() {
    registerComponent(InteriorMapComponent);

    const [selectedScene, setSelectedScene] = useState<Prefab>(gameLevel as unknown as Prefab);
    const [selectedPrefabName, setSelectedPrefabName] = useState("game-level");

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas camera={{ position: [0, 1, 10] }}>
                <ambientLight intensity={0.8} />
                <PrefabRoot
                    basePath={BASE_PATH}
                    data={selectedScene}
                />
                <OrbitControls />
            </GameCanvas>

            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <PrefabSelector
                    selectedName={selectedPrefabName}
                    onSelect={(prefab: Prefab, prefabName) => {
                        setSelectedScene(prefab);
                        setSelectedPrefabName(prefabName);
                    }}
                />
            </div>
        </main>
    );
}
