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
        <div>
            <div className="metal-label mb-3">
                Install
            </div>
            <button
                onClick={copyToClipboard}
                className="metal-terminal group mb-4 flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-all hover:border-zinc-600"
            >
                <span className="relative z-10 flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-green-500">$</span>
                    <span className="truncate text-zinc-300">{text}</span>
                </span>
                <span className="relative z-10 ml-4 shrink-0 text-xs text-zinc-500 group-hover:text-zinc-400">
                    {copied ? "✓ Copied" : "Copy"}
                </span>
            </button>

            <div className="flex gap-3">
                <a
                    href="https://www.npmjs.com/package/react-three-game"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="metal-button flex-1 px-4 py-2 text-xs"
                >
                    NPM
                </a>
                <a
                    href="https://github.com/prnthh/react-three-game"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="metal-button flex-1 px-4 py-2 text-xs"
                >
                    GitHub
                </a>
            </div>
        </div>
    );
}
