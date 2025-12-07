"use client";

import { GameCanvas, PrefabRoot } from "react-three-game";

export default function Home() {
    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <GameCanvas>
                <PrefabRoot data={{ "id": "root", "name": "Root", "root": { id: "root-object", enabled: true, visible: true } }} />
            </GameCanvas>
        </main>
    );
}
