"use client";

import Link from "next/link";
import { useState } from "react";

type DemoOption = {
    label: string;
    href: string;
};

export default function Dropdown() {
    const [open, setOpen] = useState(false);

    const options: DemoOption[] = [
        { label: "Viewer", href: "/demo" },
        { label: "Asset Viewer", href: "/demo/assetviewer" },
        { label: "Custom Editor", href: "/demo/customeditor" },
    ];

    return (
        <div
            className="relative"
            onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
            }}
        >
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="group relative overflow-hidden border border-zinc-400 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-6 py-3 font-mono text-sm uppercase tracking-wide text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-3"
            >
                <span className="relative z-10">Try Demo</span>
                <span className="relative z-10 text-xs text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                    ▾
                </span>
                <div className="absolute inset-0 -translate-x-full bg-zinc-200 dark:bg-zinc-800 transition-transform group-hover:translate-x-0" />
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close demo menu"
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setOpen(false)}
                    />
                    <div
                        role="menu"
                        aria-label="Demo options"
                        className="absolute left-0 z-20 mt-2 min-w-full overflow-hidden border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl shadow-zinc-200/40 dark:shadow-zinc-950/50"
                    >
                        {options.map((opt) => (
                            <Link
                                key={opt.href}
                                role="menuitem"
                                href={opt.href}
                                onClick={() => setOpen(false)}
                                className="block px-4 py-2.5 font-mono text-xs uppercase tracking-wide text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            >
                                {opt.label}
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
