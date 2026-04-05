
import type { Viewport } from "next";
import Link from "next/link";
import ClickToCopy from "./components/ClickToCopy";
import DemoApp from "./components/DemoAppLoader";
import Dropdown from "./components/Dropdown";

function Features() {
  return (
    <div>
      <div className="mb-3 font-mono uppercase font-black opacity-80">
        Highlights
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
  return <>
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center gap-4 text-zinc-900">

      <div className="text-center font-bold">
        <h1 className="text-4xl mb-2 text-shadow-[0_0_5px_rgba(255,255,255,1)]">
          REACT-THREE-GAME
        </h1>
        <div className="mb-4 opacity-80 tracking-tight leading-tight text-shadow-[0_0_3px_rgba(255,255,255,1)]">
          composable game engine and editor in react-three-fiber
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

        <ClickToCopy text={"npm i react-three-game"} />
      </Section>

      <DemoApp />
    </main>
    <div className="w-full bg-blue-950 text-center relative flex flex-col items-center gap-6 py-12">
      <div className="max-w-[80vw]">
        <Section title="Documentation">
          <Features />
        </Section>
      </div>

    </div>
  </>;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
  return <div className="relative border border-zinc-300 bg-zinc-50 p-4 shadow-2xl shadow-zinc-200/50">
    <div className="absolute -left-px -top-px h-8 w-8 border-l border-t border-zinc-400" />
    <div className="absolute -right-px -top-px h-8 w-8 border-r border-t border-zinc-400" />


    {children}
  </div>;
}
