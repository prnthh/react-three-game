"use client";

import { PrefabEditor } from "react-three-game";
import testPrefab from "../../samples/test.json";

export default function Home() {
    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor initialPrefab={testPrefab} />
        </main>
    );
}
