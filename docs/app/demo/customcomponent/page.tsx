"use client";

import { registerComponent } from "react-three-game/viewer";
import { PrefabEditor } from "react-three-game/editor";
import RotatorComponent from "./RotatorComponent";
import SquishComponent from "./SquishComponent";
import { rotatorScene } from "./scene";
import { BASE_PATH } from "../../basePath";

registerComponent(RotatorComponent);
registerComponent(SquishComponent);

export default function CustomComponentDemo() {
    return <main className="h-screen w-screen">
        <PrefabEditor basePath={BASE_PATH} prefab={rotatorScene} canvasProps={{ camera: { position: [8, 7, 12] } }}>
            <ambientLight intensity={2} />
            <directionalLight position={[4, 6, 3]} intensity={2} />
        </PrefabEditor>
    </main>;
}
