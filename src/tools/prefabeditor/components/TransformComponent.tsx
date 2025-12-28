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

    return <div style={{ display: 'flex', flexDirection: 'column' }}>
        {transformMode && setTransformMode && (
            <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Transform Mode</label>
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
        <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {label}
            </label>

            <div style={{ display: 'flex', gap: 4 }}>
                {axes.map(({ key, color, index }) => (
                    <div
                        key={key}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(34, 211, 238, 0.2)', borderRadius: 4, padding: '4px 6px', minHeight: 32 }}
                    >
                        {/* SCRUB HANDLE */}
                        <span
                            style={{ fontSize: '12px', fontWeight: 'bold', color: color === 'red' ? 'rgba(248, 113, 113, 1)' : color === 'green' ? 'rgba(134, 239, 172, 1)' : 'rgba(96, 165, 250, 1)', width: 12, cursor: 'ew-resize', userSelect: 'none' }}
                            onPointerDown={e => startScrub(e, index)}
                            onPointerMove={onScrubMove}
                            onPointerUp={endScrub}
                        >
                            {key.toUpperCase()}
                        </span>

                        {/* TEXT INPUT */}
                        <input
                            style={{ flex: 1, backgroundColor: 'transparent', fontSize: '12px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none', width: '100%', minWidth: 0 }}
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
