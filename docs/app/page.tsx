"use client";

import { PrefabEditor } from "react-three-game";
import testPrefab from "./samples/test.json";
import { useState } from "react";

export default function Home() {
  const [selectedPrefab, setSelectedPrefab] = useState<any>(testPrefab);
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      <PrefabEditor initialPrefab={selectedPrefab} />

      <div className="fixed top-10 left-1/2 -translate-x-1/2 z-2">
        <select className="bg-white text-black" onChange={(e) => {
          import(`./samples/${e.target.value}`).then((mod) => {
            setSelectedPrefab(mod.default);
          });
        }}>
          {['test', 'killbox'].map((prefabName) => (
            <option key={prefabName} value={prefabName}>{prefabName} prefab</option>
          ))}
        </select>

      </div>
    </main>
  );
}
