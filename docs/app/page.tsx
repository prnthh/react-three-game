
import type { Viewport } from "next";
import Link from "next/link";
import ClickToCopy from "./components/ClickToCopy";
import DemoApp from "./components/DemoAppLoader";
import Dropdown from "./components/Dropdown";

function Features() {
  return (
    <div>
      <div className="metal-label mb-3">How it works</div>
      <ul className="space-y-1.5 text-left font-mono text-sm font-semibold text-zinc-950/80">
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Create prefabs in the editor</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Export prefabs as JSON</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Load prefabs in your app using viewer</span>
        </li>
      </ul>
    </div>
  );
}

function Features2() {
  return (
    <div>
      <div className="metal-label mb-3">Highlights</div>
      <ul className="space-y-1.5 text-left font-mono text-sm font-semibold text-zinc-950/80">
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>JSON serialised prefabs</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Lightweight embeddable viewer mode</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Define custom components</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Composable with react-three-fiber</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Pure renderer core with userland runtime hooks</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>WebGPU renderer via Three.js</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
          <span>Automatic instancing optimization</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-emerald-700">▸</span>
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
    <main className="relative flex h-screen w-full flex-col items-center justify-center px-4 text-zinc-900">
      <div className="relative z-10 flex flex-col items-center">
        <div className="text-center font-bold">
          <h1 className="metal-title mb-2">REACT-THREE-GAME</h1>
          <div className="metal-subtitle mt-1">
            high performance 3D game engine built in React
          </div>
        </div>

        <div className="h-[clamp(2rem,7vh,5rem)]" />

        <div className="flex flex-col items-center gap-4">
          <Section className="metal-panel-top z-20">
            <div className="flex flex-wrap justify-center gap-3">
              <Dropdown />
              <Link
                href="/editor"
                className="metal-button px-6 py-3"
              >
                Use Editor
              </Link>
            </div>
          </Section>

          <Section className="z-10">
            <ClickToCopy text={"npm i react-three-game"} />
          </Section>
        </div>
      </div>

      <DemoApp />
    </main>
    <div className="relative flex w-full flex-col items-center gap-6 bg-zinc-950 py-12 text-center">
      <div className="flex w-full max-w-5xl flex-col gap-5 px-4 md:flex-row">
        <Section className="flex-1">
          <Features />
        </Section>
        <Section className="flex-1">
          <Features2 />
        </Section>
      </div>
    </div>
  </>;
}

const Section = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  return <div className={`metal-panel p-4 ${className}`}>
    {children}
  </div>;
}
