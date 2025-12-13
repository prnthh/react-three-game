"use client";

import { useState } from "react";
import { PrefabEditor } from "react-three-game";
import AgenticEditor from "../../AgenticEditor";
import testPrefab from "../../samples/test.json";

export default function Home() {
    const [selectedPrefab, setSelectedPrefab] = useState<any>(testPrefab);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor initialPrefab={selectedPrefab} />

            <div className="fixed bottom-4 right-4 z-2">
                <AgenticEditor prefab={selectedPrefab} onPrefabChange={setSelectedPrefab} />
            </div>
        </main>
    );
}
