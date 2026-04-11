"use client";

import { PrefabEditor, registerComponent } from "react-three-game";
import RotatorComponent from "./RotatorComponent";
import SquishComponent from "./SquishComponent";
import rotatorDemo from "./rotator-demo.json";

// Register custom component before using the editor
registerComponent(RotatorComponent);
registerComponent(SquishComponent);

export default function Home() {
    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor initialPrefab={rotatorDemo} />
        </main>
    );
}
