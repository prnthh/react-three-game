"use client";

import { useRef, useState } from "react";
import { PrefabEditor, registerComponent } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import initialWorld from "../../../public/prefabs/killbox.json";
import type { Prefab, PrefabEditorRef } from "react-three-game/editor";

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
    const [selectedPrefab, setSelectedPrefab] = useState<Prefab>(initialWorld as Prefab);
    const [selectedPrefabName, setSelectedPrefabName] = useState("killbox");

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor
                ref={editorRef}
                basePath={BASE_PATH}
                initialPrefab={selectedPrefab}
                uiPlugins={(
                    <PrefabSelector
                        selectedName={selectedPrefabName}
                        onSelect={(prefab, prefabName) => {
                            setSelectedPrefab(prefab);
                            setSelectedPrefabName(prefabName);
                        }}
                    />
                )}
            >
                <CrashcatRuntime>
                    <FirstPersonPlayer />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}
