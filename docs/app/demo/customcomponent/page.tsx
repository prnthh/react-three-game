"use client";

import { useEffect, useState } from "react";
import { registerComponent, type Prefab } from "react-three-game";
import { PrefabEditor } from "react-three-game/editor";
import rotatorDemo from "./rotator-demo.json";
import { BASE_PATH } from "../../basePath";

export default function Home() {
    const [pluginsReady, setPluginsReady] = useState(false);

    useEffect(() => {
        let active = true;

        void import("./plugin").then(({ components }) => {
            if (!active) return;
            components.forEach(registerComponent);
            setPluginsReady(true);
        });

        return () => { active = false; };
    }, []);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            {pluginsReady ? <PrefabEditor basePath={BASE_PATH} prefab={rotatorDemo as unknown as Prefab} /> : null}
        </main>
    );
}
