"use client";

import Link from "next/link";
import { useState } from "react";

type DemoOption = {
    label: string;
    href: string;
};

// Ordered by the concepts introduced.
const options: DemoOption[] = [
    { label: "Viewer Mode", href: "/viewer" },
    { label: "Asset Viewer", href: "/demo/assetviewer" },
    { label: "Custom Component", href: "/demo/customcomponent" },
    { label: "Cool stuff", href: "/demo/coolstuff" },
    { label: "Jumper API Playground", href: "/demo/jumper" },
    { label: "Point n Click", href: "/demo/stage" },
    { label: "Killbox FPS", href: "/demo/killbox" },
    { label: "Streamed World", href: "/demo/grassworld" },
];

export default function Dropdown() {
    const [open, setOpen] = useState(false);

    return (
        <div className={`relative ${open ? "z-50" : "z-10"}`}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                }}
                className="metal-button gap-2 px-6 py-3"
            >
                Examples
                <span className="text-xs">▾</span>
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close demo menu"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setOpen(false)}
                    />
                    <div
                        role="menu"
                        aria-label="Demo options"
                        onKeyDown={(e) => {
                            if (e.key === "Escape") setOpen(false);
                        }}
                        onMouseLeave={() => setOpen(false)}
                        className="metal-menu left-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto"
                    >
                        {options.map((opt) => (
                            <Link
                                key={opt.href}
                                role="menuitem"
                                href={opt.href}
                                onClick={() => setOpen(false)}
                                className="metal-menu-item px-4 py-2.5"
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
