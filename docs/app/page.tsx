
import type { Viewport } from "next";
import Link from "next/link";
import ClickToCopy from "./components/ClickToCopy";
import DemoApp from "./components/DemoAppLoader";
import Dropdown from "./components/Dropdown";

function Features() {
  return (
    <div>
      <div className="mb-3 font-mono uppercase opacity-50">
        Features
      </div>
      <ul className="space-y-1.5 font-mono text-opacity-50 dark:text-zinc-400">
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>JSON scene graph</span>
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
  return <main className="flex flex-col gap-4 h-screen w-screen items-center justify-center text-zinc-900 dark:text-zinc-100">
    <Section title="React-Three-Game">
      <h1 className="font-mono font-light tracking-wider">
        REACT-THREE-GAME (R3G)
      </h1>
      <div className="mb-4 opacity-50">
        Batteries-included Game Engine <br /> for react-three-fiber.
      </div>

      <div className="flex gap-3">
        <Dropdown />
        <Link
          href="/editor"
          className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-6 py-3 font-mono uppercase tracking-wide transition-all hover:border-zinc-500"
        >
          <span className="relative z-10">Use Editor</span>
          <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
        </Link>
      </div>

      <ClickToCopy text={"npm i react-three-game"} />
    </Section>
    <Section title="Documentation">
      <Features />
    </Section>
    <DemoApp />
  </main>;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  return <div className="relative border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-12 shadow-2xl shadow-zinc-200/50 dark:shadow-zinc-950/50">
    <div className="absolute -left-px -top-px h-8 w-8 border-l border-t border-zinc-400 dark:border-zinc-600" />
    <div className="absolute -right-px -top-px h-8 w-8 border-r border-t border-zinc-400 dark:border-zinc-600" />


    {children}
  </div>;
}
