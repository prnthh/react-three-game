
import type { Viewport } from "next";
import Link from "next/link";
import ClickToCopy from "./components/ClickToCopy";
import Dropdown from "./components/Dropdown";

function Features() {
  return (
    <div className="mt-6 border-t border-zinc-300 dark:border-zinc-800 pt-6">
      <div className="mb-3 font-mono text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
        Features
      </div>
      <ul className="space-y-1.5 font-mono text-sm text-zinc-700 dark:text-zinc-400">
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>AI-first JSON prefab system</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Component-based architecture</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Visual prefab editor with hot reload</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Built-in physics with Rapier</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>WebGPU renderer via Three.js</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Automatic instancing optimization</span>
        </li>
      </ul>
    </div>
  );
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" }
  ]
};

export default function Home() {
  return <main className="flex h-screen w-screen items-center justify-center bg-white dark:bg-black">
    <div className="relative border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-12 shadow-2xl shadow-zinc-200/50 dark:shadow-zinc-950/50">
      <div className="absolute -left-px -top-px h-8 w-8 border-l border-t border-zinc-400 dark:border-zinc-600" />
      <div className="absolute -right-px -top-px h-8 w-8 border-r border-t border-zinc-400 dark:border-zinc-600" />

      <h1 className="mb-2 font-mono text-3xl font-light tracking-wider text-zinc-900 dark:text-zinc-100">
        REACT-THREE-GAME
      </h1>
      <div className="mb-8 font-mono text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
        Flexible 3D Prefab Editor
      </div>

      <div className="flex gap-3">
        <Dropdown />
        <Link
          href="/editor"
          className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-6 py-3 font-mono text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <span className="relative z-10">Use Editor</span>
          <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
        </Link>
      </div>

  <ClickToCopy text={"npm i react-three-game"} />
      <Features />
    </div>
  </main>;
}
