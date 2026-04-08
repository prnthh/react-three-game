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
        { label: "Viewer Mode", href: "/viewer" },
        { label: "Custom Component", href: "/demo/customcomponent" },
        { label: "ECS World", href: "/demo/world" },
        { label: "Physics", href: "/demo/physics" },
        { label: "Quake", href: "/demo/quake" },
        { label: "Asset Viewer", href: "/demo/assetviewer" },
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
                className="border border-zinc-400 px-6 py-3 font-mono text-sm uppercase hover:bg-zinc-200 inline-flex items-center gap-2"
            >
                Examples
                <span className="text-xs">▾</span>
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
                        onMouseLeave={() => setOpen(false)}
                        className="absolute left-0 top-full z-20 mt-2 w-48 max-w-[calc(100vw-2rem)] overflow-hidden border border-zinc-300 bg-white shadow-xl shadow-zinc-200/40"
                    >
                        {options.map((opt) => (
                            <Link
                                key={opt.href}
                                role="menuitem"
                                href={opt.href}
                                onClick={() => setOpen(false)}
                                className="block px-4 py-2.5 font-mono text-xs uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
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
