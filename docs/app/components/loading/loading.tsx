"use client";

import { useEffect, useState } from "react";

const lines = [
    "$ initializing...",
    "✓ loading scene",
    "✓ ready"
];

const LoadingSpinner = () => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (index < lines.length) {
            const timer = setTimeout(() => setIndex(index + 1), 300);
            return () => clearTimeout(timer);
        }
    }, [index]);

    return (
        <div className="fixed inset-0 z-50 bg-[#0a0a0a] p-8 font-mono text-sm text-[#00ff00]">
            {lines.slice(0, index).map((line, i) => (
                <div key={i}>{line}</div>
            ))}
            <div className="animate-pulse">█</div>
        </div>
    );
};

export default LoadingSpinner;