"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

const DemoApp = dynamic(() => import("./DemoApp"), {
  ssr: false,
});

export default function DemoAppLoader() {
  const [sceneReady, setSceneReady] = useState(false);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  return (
    <div className="absolute inset-0 -z-1 h-full w-full">
      <DemoApp onReady={handleSceneReady} />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 bg-zinc-950/25 backdrop-blur-xl transition-opacity duration-700 ease-out ${sceneReady ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
}
