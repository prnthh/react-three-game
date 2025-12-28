"use client";

import { useState, useRef, useEffect } from "react";
import { PrefabEditor } from "react-three-game";
import AgenticEditor from "../AgenticEditor";
import testPrefab from "../samples/test.json";

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
      <PrefabEditor initialPrefab={selectedPrefab} />

      <div className="fixed top-10 left-1/2 -translate-x-1/2 z-2">
        <select className="bg-white text-black" onChange={(e) => {
          import(`../samples/${e.target.value}`).then((mod) => {
            setSelectedPrefab(mod.default);
          });
        }}>
          {['test', 'floor', 'killbox'].map((prefabName) => (
            <option key={prefabName} value={prefabName}>{prefabName} prefab</option>
          ))}
        </select>

      </div>
      <div className="fixed bottom-4 right-4 z-2">
        <AgenticEditor
          prefab={selectedPrefab}
          onPrefabChange={setSelectedPrefab}
          canvasRef={canvasRef}
        />
      </div>
    </main>

  );

}
