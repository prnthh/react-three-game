"use client";

import { useState } from "react";
import { registerComponent } from "react-three-game";
import { PrefabEditor } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import { BASE_PATH } from "../../../basePath";
import {
    ActivationColliderEditorComponent,
    StageInteractionEditorComponent,
} from "../editorComponents";
import { STAGE_SCENES } from "../scenes";
import type { StageScene } from "../scenes/types";
import StageCameraRouteComponent from "../StageCameraRouteComponent";

function countNodes(scene: StageScene) {
    let count = 0;
    const visit = (node: StageScene["prefab"]["root"]) => {
        count += 1;
        node.children?.forEach(visit);
    };
    visit(scene.prefab.root);
    return count;
}

export default function StageEditor() {
    registerComponent(CrashcatPhysicsComponent);
    registerComponent(ActivationColliderEditorComponent);
    registerComponent(StageInteractionEditorComponent);
    registerComponent(StageCameraRouteComponent);

    const [selectedScene, setSelectedScene] = useState<StageScene | null>(null);

    return (
        <main className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
            <nav className="flex h-12 shrink-0 items-end border-b border-zinc-800 bg-zinc-900 px-4">
                <button
                    type="button"
                    className="h-10 border-b-2 border-cyan-400 px-4 text-sm font-semibold text-white"
                >
                    Scenes
                </button>
            </nav>

            {selectedScene ? (
                <>
                    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4">
                        <button
                            type="button"
                            onClick={() => setSelectedScene(null)}
                            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700"
                        >
                            ← Back
                        </button>
                        <div>
                            <div className="text-sm font-semibold">{selectedScene.prefab.name ?? selectedScene.id}</div>
                            <div className="text-xs text-zinc-500">{selectedScene.prefab.id ?? selectedScene.id}</div>
                        </div>
                    </div>
                    <div className="relative min-h-0 flex-1">
                        <PrefabEditor
                            key={selectedScene.id}
                            basePath={BASE_PATH}
                            prefab={selectedScene.prefab}
                        >
                            <CrashcatRuntime />
                        </PrefabEditor>
                    </div>
                </>
            ) : (
                <section className="min-h-0 flex-1 overflow-y-auto p-6">
                    <div className="mx-auto grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                        {STAGE_SCENES.map((scene) => (
                            <button
                                key={scene.id}
                                type="button"
                                onClick={() => setSelectedScene(scene)}
                                className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-left transition hover:border-cyan-500 hover:bg-zinc-800"
                            >
                                <div className="grid aspect-video place-items-center bg-gradient-to-br from-zinc-800 to-zinc-950">
                                    <span className="text-4xl text-zinc-600 transition group-hover:text-cyan-400">◇</span>
                                </div>
                                <div className="p-4">
                                    <div className="font-semibold text-white">{scene.prefab.name ?? scene.id}</div>
                                    <div className="mt-1 text-xs text-zinc-500">
                                        {countNodes(scene)} nodes · {Object.keys(scene.prefab.materials ?? {}).length} materials
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </main>
    );
}
