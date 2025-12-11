"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-white dark:bg-black">
      <div className="relative border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-16 shadow-2xl shadow-zinc-200/50 dark:shadow-zinc-950/50">
        <div className="absolute -left-px -top-px h-8 w-8 border-l border-t border-zinc-400 dark:border-zinc-600" />
        <div className="absolute -right-px -top-px h-8 w-8 border-r border-t border-zinc-400 dark:border-zinc-600" />

        <div className="mb-3 font-mono text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-600">
          AI-Native 3D Engine
        </div>
        <h1 className="mb-12 font-mono text-3xl font-light tracking-wider text-zinc-900 dark:text-zinc-100">
          REACT-THREE-GAME
        </h1>

        <div className="flex gap-3">
          <Link
            href="/demo"
            className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-8 py-3.5 font-mono text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span className="relative z-10">Try Demo</span>
            <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
          </Link>
          <Link
            href="/editor"
            className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-8 py-3.5 font-mono text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <span className="relative z-10">Use Editor</span>
            <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
          </Link>
        </div>
      </div>
    </main>
  );
}
