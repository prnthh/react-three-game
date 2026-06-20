"use client";

import { GameCanvas, PrefabRoot } from "react-three-game/viewer";
import { useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { BASE_PATH, withBasePath } from "../basePath";
import type { Prefab } from "react-three-game/viewer";

import PrefabSelector from "../components/PrefabSelector";
import AnimationMixer from "./components/AnimationMixer";
import SkinnedMesh, { type SkinnedMeshRef } from "./components/SkinnedMesh";
import gameLevel from "../../public/prefabs/game-level.json";

const ONIMILIO_MODEL = withBasePath("/models/human/onimilio.glb");

export default function Home() {
    const [selectedScene, setSelectedScene] = useState<Prefab>(gameLevel as Prefab);
    const [selectedPrefabName, setSelectedPrefabName] = useState("game-level");
    const onimilioRef = useRef<SkinnedMeshRef>(null);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas camera={{ position: [0, 1, 10] }}>
                <ambientLight intensity={0.8} />
                <PrefabRoot
                    basePath={BASE_PATH}
                    data={selectedScene} />
                <group position={[0, 0, 0]}>
                    <SkinnedMesh ref={onimilioRef} model={ONIMILIO_MODEL} />
                    <AnimationMixer skinnedMeshRef={onimilioRef} />
                </group>
                <OrbitControls />
            </GameCanvas>

            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <PrefabSelector
                    selectedName={selectedPrefabName}
                    onSelect={(prefab, prefabName) => {
                        setSelectedScene(prefab);
                        setSelectedPrefabName(prefabName);
                    }}
                />
            </div>
        </main>
    );
}
