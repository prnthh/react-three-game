"use client";

import type { Prefab } from "react-three-game/core";
import { PrefabEditor } from "react-three-game/editor";
import { BASE_PATH } from "../../basePath";
import scene from "../../../public/prefabs/music-video.json";
import { registerComponent } from "react-three-game/viewer";
import CutsceneDirectorComponent from "./components/CutsceneDirectorComponent";

registerComponent(CutsceneDirectorComponent);

export default function MusicVideoDemo() {
    return <main className="h-screen w-screen">
        <PrefabEditor basePath={BASE_PATH} prefab={scene as Prefab} canvasProps={{ camera: { position: [0, 2, 6] } }}>
            <color attach="background" args={["#0b0d17"]} />
        </PrefabEditor>
    </main>;
}
