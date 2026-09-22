import { useEffect, useRef, useState } from "react";

export default function DialogueBox({ text, onNext }: { text: string; onNext(): void }) {
    const [visible, setVisible] = useState(0);
    const timerRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        let count = 0;
        const timer = window.setInterval(() => {
            count = Math.min(count + 1, text.length);
            setVisible(count);
            if (count === text.length) window.clearInterval(timer);
        }, 24);
        timerRef.current = timer;
        return () => window.clearInterval(timer);
    }, [text]);
    return <button
        type="button"
        onClick={() => {
            if (visible < text.length) {
                window.clearInterval(timerRef.current);
                setVisible(text.length);
            } else onNext();
        }}
        className="absolute bottom-8 left-1/2 z-20 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 cursor-pointer rounded-2xl border-4 border-black bg-[#fff7cf] px-6 py-5 text-left font-mono text-base leading-relaxed text-black shadow-[8px_8px_0_#1b1b1b] sm:text-lg"
        aria-label="Continue dialogue"
    >
        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[#8b3d2f]">Field notes</span>
        {text.slice(0, visible)}
        <span className="ml-1 animate-pulse">{visible < text.length ? "▌" : "▼"}</span>
    </button>;
}
