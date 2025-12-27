import { useEffect, useRef, useState } from "react";
import { Component } from "./ComponentRegistry";

function TransformComponentEditor({ component, onUpdate, transformMode, setTransformMode }: {
    component: any;
    onUpdate: (newComp: any) => void;
    transformMode?: "translate" | "rotate" | "scale";
    setTransformMode?: (m: "translate" | "rotate" | "scale") => void;
}) {
    const s = {
        button: {
            padding: '2px 6px',
            background: 'transparent',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            cursor: 'pointer',
            font: 'inherit',
        },
        buttonActive: {
            background: 'rgba(255,255,255,0.10)',
        },
    };

    return <div className="flex flex-col">
        {transformMode && setTransformMode && (
            <div className="mb-2">
                <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-1">Transform Mode</label>
                <div style={{ display: 'flex', gap: 6 }}>
                    {["translate", "rotate", "scale"].map(mode => (
                        <button
                            key={mode}
                            onClick={() => setTransformMode(mode as any)}
                            style={{
                                ...s.button,
                                flex: 1,
                                ...(transformMode === mode ? s.buttonActive : {}),
                            }}
                            onPointerEnter={(e) => {
                                if (transformMode !== mode) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                            }}
                            onPointerLeave={(e) => {
                                if (transformMode !== mode) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>
        )}
        <Vector3Input label="Position" value={component.properties.position} onChange={v => onUpdate({ position: v })} />
        <Vector3Input label="Rotation" value={component.properties.rotation} onChange={v => onUpdate({ rotation: v })} />
        <Vector3Input label="Scale" value={component.properties.scale} onChange={v => onUpdate({ scale: v })} />
    </div>;
}

const TransformComponent: Component = {
    name: 'Transform',
    Editor: TransformComponentEditor,
    defaultProperties: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    }
};

export default TransformComponent;

export function Vector3Input({
    label,
    value,
    onChange
}: {
    label: string;
    value: [number, number, number];
    onChange: (v: [number, number, number]) => void;
}) {
    const [draft, setDraft] = useState<[string, string, string]>(
        () => value.map(v => v.toString()) as any
    );

    // Sync external changes (gizmo, undo, etc.)
    useEffect(() => {
        setDraft(value.map(v => v.toString()) as any);
    }, [value[0], value[1], value[2]]);

    const dragState = useRef<{
        index: number;
        startX: number;
        startValue: number;
    } | null>(null);

    const commit = (index: number) => {
        const num = parseFloat(draft[index]);
        if (Number.isFinite(num)) {
            const next = [...value] as [number, number, number];
            next[index] = num;
            onChange(next);
        }
    };

    const startScrub = (e: React.PointerEvent, index: number) => {
        e.preventDefault();

        dragState.current = {
            index,
            startX: e.clientX,
            startValue: value[index]
        };

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        document.body.style.cursor = "ew-resize";
    };

    const onScrubMove = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        const { index, startX, startValue } = dragState.current;
        const dx = e.clientX - startX;

        let speed = 0.02;
        if (e.shiftKey) speed *= 0.1; // fine
        if (e.altKey) speed *= 5;     // coarse

        const nextValue = startValue + dx * speed;
        const next = [...value] as [number, number, number];
        next[index] = nextValue;

        setDraft(d => {
            const copy = [...d] as any;
            copy[index] = nextValue.toFixed(3);
            return copy;
        });

        onChange(next);
    };

    const endScrub = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        dragState.current = null;
        document.body.style.cursor = "";
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const axes = [
        { key: "x", color: "red", index: 0 },
        { key: "y", color: "green", index: 1 },
        { key: "z", color: "blue", index: 2 }
    ] as const;

    return (
        <div className="mb-2">
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-1">
                {label}
            </label>

            <div className="flex gap-1">
                {axes.map(({ key, color, index }) => (
                    <div
                        key={key}
                        className="flex-1 flex items-center gap-1 bg-black/30 border border-cyan-500/20 rounded px-1.5 py-1 min-h-[32px]"
                    >
                        {/* SCRUB HANDLE */}
                        <span
                            className={`text-xs font-bold text-${color}-400 w-3 cursor-ew-resize select-none`}
                            onPointerDown={e => startScrub(e, index)}
                            onPointerMove={onScrubMove}
                            onPointerUp={endScrub}
                        >
                            {key.toUpperCase()}
                        </span>

                        {/* TEXT INPUT */}
                        <input
                            className="flex-1 bg-transparent text-xs text-cyan-200 font-mono outline-none w-full min-w-0"
                            type="text"
                            value={draft[index]}
                            onChange={e => {
                                const next = [...draft] as any;
                                next[index] = e.target.value;
                                setDraft(next);
                            }}
                            onBlur={() => commit(index)}
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
