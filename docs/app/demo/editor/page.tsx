"use client";

import { PrefabEditor, registerComponent } from "react-three-game";
import rotatorDemo from "../../samples/rotator-demo.json";
import RotatorComponent from "./RotatorComponent";

// Register custom component before using the editor
registerComponent(RotatorComponent);

export default function Home() {
    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor initialPrefab={rotatorDemo} />
        </main>
    );
}
