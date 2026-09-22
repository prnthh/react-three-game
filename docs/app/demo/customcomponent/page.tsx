"use client";

import { registerComponent, type Prefab } from "react-three-game/viewer";
import { PrefabEditor } from "react-three-game/editor";
import RotatorComponent from "./RotatorComponent";
import SquishComponent from "./SquishComponent";
import rotatorDemo from "./rotator-demo.json";
import { BASE_PATH } from "../../basePath";

registerComponent(RotatorComponent);
registerComponent(SquishComponent);

export default function CustomComponentDemo() {
    return <main className="h-screen w-screen">
        <PrefabEditor basePath={BASE_PATH} prefab={rotatorDemo as unknown as Prefab} />
    </main>;
}
