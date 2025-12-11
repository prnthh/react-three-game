"use client";

import Link from "next/link";
import { useState } from "react";
import type { Viewport, Metadata } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" }
  ]
};

export const metadata: Metadata = {
  metadataBase: new URL("https://prnth.com/react-three-game"),
  title: "React Three Game - AI-Native 3D Engine",
  description: "The first 3D game engine designed for AI-native development. Everything is JSON-serializable prefabs that AI agents can generate, modify, and compose without writing imperative code.",
  keywords: ["react", "three.js", "3d", "game engine", "webgpu", "ai", "prefab", "game development"],
  authors: [{ name: "prnthh" }],
  openGraph: {
    title: "React Three Game - AI-Native 3D Engine",
    description: "WebGPU based 3D game engine designed for AI-native development",
    siteName: "React Three Game",
    type: "website",
    locale: "en_US",
    url: "https://prnth.com/react-three-game"
  },
  twitter: {
    card: "summary_large_image",
    title: "React Three Game - AI-Native 3D Engine",
    description: "WebGPU based 3D game engine designed for AI-native development"
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: "index, follow"
  },
  applicationName: "React Three Game",
  appleWebApp: {
    title: "React Three Game",
    statusBarStyle: "default",
    capable: true
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        type: "image/x-icon"
      }
    ],
    shortcut: [
      {
        url: "/favicon.ico",
        type: "image/x-icon"
      }
    ]
  }
};

function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText("npm i react-three-game");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 border-t border-zinc-300 dark:border-zinc-800 pt-6">
      <div className="mb-3 font-mono text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
        Install
      </div>
      <button
        onClick={copyToClipboard}
        className="group relative mb-4 w-full overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-black px-4 py-2.5 font-mono text-sm text-left transition-all hover:border-zinc-500 flex items-center justify-between"
      >
        <span className="relative z-10 flex items-center gap-2">
          <span className="text-green-500">$</span>
          <span className="text-zinc-300">npm i react-three-game</span>
        </span>
        <span className="relative z-10 text-xs text-zinc-500 group-hover:text-zinc-400">
          {copied ? "✓ Copied" : "Copy"}
        </span>
        <div className="absolute inset-0 bg-zinc-900 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      <div className="flex gap-3">
        <a
          href="https://www.npmjs.com/package/react-three-game"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex-1 overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-4 py-2 text-center font-mono text-xs uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <span className="relative z-10">NPM</span>
          <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
        </a>
        <a
          href="https://github.com/prnthh/react-three-game"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex-1 overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-4 py-2 text-center font-mono text-xs uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <span className="relative z-10">GitHub</span>
          <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
        </a>
      </div>
    </div>
  );
}

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

export default function Home() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-white dark:bg-black">
      <div className="relative border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-12 shadow-2xl shadow-zinc-200/50 dark:shadow-zinc-950/50">
        <div className="absolute -left-px -top-px h-8 w-8 border-l border-t border-zinc-400 dark:border-zinc-600" />
        <div className="absolute -right-px -top-px h-8 w-8 border-r border-t border-zinc-400 dark:border-zinc-600" />

        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
          AI-Native 3D Engine
        </div>
        <h1 className="mb-8 font-mono text-3xl font-light tracking-wider text-zinc-900 dark:text-zinc-100">
          REACT-THREE-GAME
        </h1>

        <div className="flex gap-3">
          <Link
            href="/demo"
            className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-6 py-3 font-mono text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span className="relative z-10">Try Demo</span>
            <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
          </Link>
          <Link
            href="/editor"
            className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-6 py-3 font-mono text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span className="relative z-10">Use Editor</span>
            <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
          </Link>
        </div>

        <InstallCommand />
        <Features />
      </div>
    </main>
  );
}
