"use client";

import { useState, useRef, useEffect } from "react";
import { PrefabEditor } from "react-three-game";
import testPrefab from "../samples/game-level.json";

export default function Home() {
  const [selectedPrefab, setSelectedPrefab] = useState<any>(testPrefab);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Find the canvas element after component mounts
  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvasRef.current = canvas;
    }
  }, []);

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      <PrefabEditor initialPrefab={selectedPrefab} uiPlugins={<Toolbar setSelectedPrefab={setSelectedPrefab} />} />
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

const Toolbar = ({ setSelectedPrefab }: { setSelectedPrefab: React.Dispatch<React.SetStateAction<any>> }) => {
  return <>
    <select className="bg-white text-black" onChange={(e) => {
      import(`../samples/${e.target.value}`).then((mod) => {
        setSelectedPrefab(mod.default);
      });
    }}>
      {['game-level', 'test', 'floor', 'killbox'].map((prefabName) => (
        <option key={prefabName} value={prefabName}>{prefabName} prefab</option>
      ))}
    </select>
  </>
}
