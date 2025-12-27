"use client";

import { useState } from "react";

type Props = {
    text?: string;
};

export default function ClickToCopy({ text = "npm i react-three-game" }: Props) {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(text);
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
                    <span className="text-zinc-300">{text}</span>
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
