
import type { Viewport } from "next";
import Link from "next/link";
import ClickToCopy from "./components/ClickToCopy";
import DemoApp from "./components/DemoAppLoader";
import Dropdown from "./components/Dropdown";

function Features() {
  return (
    <div>
      <div className="mb-3 font-mono uppercase font-black opacity-80">
        How it works
      </div>
      <ul className="space-y-1.5 font-mono text-opacity-50 dark:text-zinc-400 text-left">
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Create prefabs in the editor</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Export prefabs as JSON</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Load prefabs in your app using viewer</span>
        </li>
      </ul>

    </div>
  );
}

function Features2() {
  return (
    <div> <div className="mb-3 font-mono uppercase font-black opacity-80">
      Highlights
    </div>
      <ul className="space-y-1.5 font-mono text-opacity-50 dark:text-zinc-400 text-left">

        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>JSON serialised prefabs</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Lightweight embeddable viewer mode</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Define custom components</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Composable with react-three-fiber</span>
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
        <li className="flex items-start gap-2">
          <span className="text-green-500">▸</span>
          <span>Visual editor with hot reload</span>
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
  return <>
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center gap-4 text-zinc-900">

      <div className="text-center font-bold">
        <h1 className="text-4xl mb-2 text-shadow-[0_0_5px_rgba(255,255,255,1)]">
          REACT-THREE-GAME
        </h1>
        <div className="mb-4 opacity-80 tracking-tight leading-tight text-shadow-[0_0_3px_rgba(255,255,255,1)]">
          high performance 3D game engine for React
        </div>
      </div>

      <Section title="React-Three-Game">
        <div className="flex gap-3">
          <Dropdown />
          <Link
            href="/editor"
            className="border border-zinc-400 px-6 py-3 font-mono text-sm uppercase hover:bg-zinc-200"
          >
            Use Editor
          </Link>
        </div>
      </Section>

      <Section title="React-Three-Game">

        <ClickToCopy text={"npm i react-three-game"} />
      </Section>

      <DemoApp />
    </main>
    <div className="w-full bg-blue-950 text-center relative flex flex-col items-center gap-6 py-12">
      <div className="max-w-[80vw] flex gap-3">
        <Section title="Documentation">
          <Features />
        </Section>
        <Section title="Documentation">
          <Features2 />
        </Section>
      </div>

    </div>
  </>;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  return <div className="relative border border-zinc-300 bg-slate-100 p-4 shadow-2xl shadow-zinc-200/50">
    {children}
  </div>;
}
