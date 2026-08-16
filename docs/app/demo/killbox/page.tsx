"use client";

import { useRef, useState } from "react";
import { registerComponent, type Prefab } from "react-three-game";
import { PrefabEditor, type PrefabEditorRef } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import initialWorld from "../../../public/prefabs/killbox.json";

import PrefabSelector from "../../components/PrefabSelector";
import FirstPersonPlayer from "./components/FirstPersonPlayer";
import ElevatorMover from "./components/ElevatorMover";
import OrbMover from "./components/OrbMover";
import { BASE_PATH } from "../../basePath";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ElevatorMover);
registerComponent(OrbMover);

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);
    const [selectedPrefab, setSelectedPrefab] = useState<Prefab>(initialWorld as unknown as Prefab);
    const [selectedPrefabName, setSelectedPrefabName] = useState("killbox");

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor
                ref={editorRef}
                basePath={BASE_PATH}
                prefab={selectedPrefab}
            >
                <CrashcatRuntime>
                    <FirstPersonPlayer />
                </CrashcatRuntime>
            </PrefabEditor>
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <PrefabSelector
                    selectedName={selectedPrefabName}
                    onSelect={(prefab: Prefab, prefabName) => {
                        setSelectedPrefab(prefab);
                        setSelectedPrefabName(prefabName);
                    }}
                />
            </div>
        </main>
    );
}
