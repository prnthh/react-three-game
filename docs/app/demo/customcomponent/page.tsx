"use client";

import { registerComponent, type Prefab } from "react-three-game";
import { PrefabEditor } from "react-three-game/editor";
import RotatorComponent from "./RotatorComponent";
import SquishComponent from "./SquishComponent";
import rotatorDemo from "./rotator-demo.json";
import { BASE_PATH } from "../../basePath";

export default function Home() {
    registerComponent(RotatorComponent);
    registerComponent(SquishComponent);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor basePath={BASE_PATH} prefab={rotatorDemo as unknown as Prefab} />
        </main>
    );
}
