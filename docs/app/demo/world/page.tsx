"use client";

import { useRef } from "react";
import { PrefabEditor, registerComponent } from "react-three-game";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import initialWorld from "./prefab.json";
import type { Prefab, PrefabEditorRef } from "react-three-game";

import FirstPersonPlayer, { type FirstPersonPlayerRef } from "../killbox/components/FirstPersonPlayer";
import AnimationMixer from "./components/AnimationMixer";
import SkinnedMesh, { type SkinnedMeshRef } from "./components/SkinnedMesh";

registerComponent(CrashcatPhysicsComponent);

const ONIMILIO_MODEL = "/models/human/onimilio.glb";

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);
    const playerRef = useRef<FirstPersonPlayerRef>(null);
    const onimilioRef = useRef<SkinnedMeshRef>(null);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor ref={editorRef} initialPrefab={initialWorld as Prefab}>
                <CrashcatRuntime>
                    <FirstPersonPlayer ref={playerRef} />

                    <SkinnedMesh ref={onimilioRef} model={ONIMILIO_MODEL} />
                    <AnimationMixer skinnedMeshRef={onimilioRef} lookTarget={playerRef} />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}
