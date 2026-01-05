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
        <div className="terminal-loading">
            {lines.slice(0, index).map((line, i) => (
                <div key={i}>{line}</div>
            ))}
            <div className="cursor">█</div>

            <style jsx>{`
                .terminal-loading {
                    position: fixed;
                    inset: 0;
                    z-index: 50;
                    background: #0a0a0a;
                    color: #00ff00;
                    font-family: monospace;
                    padding: 2rem;
                    font-size: 14px;
                }

                .cursor {
                    animation: blink 1s infinite;
                }

                @keyframes blink {
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default LoadingSpinner;