"use client";

import { useState, useEffect } from "react";
import { PrefabEditor } from "react-three-game";
import type { Prefab } from "react-three-game";

export default function Home() {
  const [selectedPrefab, setSelectedPrefab] = useState<Prefab | null>(null);

  useEffect(() => {
    fetch('/prefabs/throne.json').then(r => r.json()).then(setSelectedPrefab);
  }, []);

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      {selectedPrefab && <PrefabEditor initialPrefab={selectedPrefab} uiPlugins={<Toolbar setSelectedPrefab={setSelectedPrefab} />} />}
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

export const Toolbar = ({ setSelectedPrefab }: { setSelectedPrefab: (p: Prefab) => void }) => {
  return <>
    <select className="bg-white text-black" onChange={(e) => {
      if (!e.target.value) return;
      fetch(`/prefabs/${e.target.value}.json`).then(r => r.json()).then(setSelectedPrefab);
    }}>
      <option value="">— select prefab —</option>
      {['throne', 'game-level', 'prefab'].map((prefabName) => (
        <option key={prefabName} value={prefabName}>{prefabName}</option>
      ))}
    </select>
  </>
}
