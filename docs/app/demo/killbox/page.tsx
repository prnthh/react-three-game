"use client";

import { useRef } from "react";
import { PrefabEditor, registerComponent } from "react-three-game";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import initialWorld from "./killbox.json";
import type { Prefab, PrefabEditorRef } from "react-three-game";

import FirstPersonPlayer from "./components/FirstPersonPlayer";
import ElevatorMover from "./components/ElevatorMover";
import OrbMover from "./components/OrbMover";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ElevatorMover);
registerComponent(OrbMover);

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor ref={editorRef} initialPrefab={initialWorld as Prefab}>
                <CrashcatRuntime>
                    <FirstPersonPlayer />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}
