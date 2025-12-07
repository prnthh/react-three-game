"use client";

import { GameCanvas, PrefabEditor } from "react-three-game";

export default function Home() {
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
      <PrefabEditor />
    </main>
  );
}
