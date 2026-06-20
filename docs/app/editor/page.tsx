"use client";

import { useEffect, useState } from "react";
import { PrefabEditor } from "react-three-game/editor";
import type { Prefab } from "react-three-game/editor";

import { BASE_PATH, withBasePath } from "../basePath";
import PrefabSelector from "../components/PrefabSelector";

export default function Home() {
  const [selectedPrefab, setSelectedPrefab] = useState<Prefab | null>(null);
  const [selectedPrefabName, setSelectedPrefabName] = useState("game-level");

  useEffect(() => {
    fetch(withBasePath('/prefabs/game-level.json')).then(r => r.json()).then(setSelectedPrefab);
  }, []);

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      {selectedPrefab && <PrefabEditor basePath={BASE_PATH} initialPrefab={selectedPrefab}
        uiPlugins={<PrefabSelector
          selectedName={selectedPrefabName}
          onSelect={(prefab: Prefab, prefabName) => {
            setSelectedPrefab(prefab);
            setSelectedPrefabName(prefabName);
          }}
        />}
      />}
      {/* <div className="fixed bottom-4 right-4 z-2">
        <AgenticEditor
          prefab={selectedPrefab}
          onPrefabChange={setSelectedPrefab}
          canvasRef={canvasRef}
        />
      </div> */}
    </main>

  );
}
