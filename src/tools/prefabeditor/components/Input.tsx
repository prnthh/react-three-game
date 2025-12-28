import React, { useEffect, useRef, useState } from 'react';

// Shared styles
const styles = {
    input: {
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '9px',
        color: 'rgba(34, 211, 238, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 2,
    } as React.CSSProperties,
};

interface InputProps {
    value: number;
    onChange: (value: number) => void;
    step?: string | number;
    min?: number;
    max?: number;
    style?: React.CSSProperties;
}

export function Input({ value, onChange, step, min, max, style }: InputProps) {
    return (
        <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            step={step}
            min={min}
            max={max}
            style={{ ...styles.input, ...style }}
        />
    );
}

export function Label({ children }: { children: React.ReactNode }) {
    return <label style={styles.label}>{children}</label>;
}

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
        { key: "x", color: 'rgba(248, 113, 113, 1)', index: 0 },
        { key: "y", color: 'rgba(134, 239, 172, 1)', index: 1 },
        { key: "z", color: 'rgba(96, 165, 250, 1)', index: 2 }
    ] as const;

    return (
        <div style={{ marginBottom: 8 }}>
            <label style={{ ...styles.label, marginBottom: 4 }}>{label}</label>
            <div style={{ display: 'flex', gap: 4 }}>
                {axes.map(({ key, color, index }) => (
                    <div
                        key={key}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(34, 211, 238, 0.2)',
                            borderRadius: 4,
                            padding: '4px 6px',
                            minHeight: 32,
                        }}
                    >
                        <span
                            style={{
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color,
                                width: 12,
                                cursor: 'ew-resize',
                                userSelect: 'none',
                            }}
                            onPointerDown={e => startScrub(e, index)}
                            onPointerMove={onScrubMove}
                            onPointerUp={endScrub}
                        >
                            {key.toUpperCase()}
                        </span>
                        <input
                            style={{
                                flex: 1,
                                backgroundColor: 'transparent',
                                border: 'none',
                                fontSize: '12px',
                                color: 'rgba(165, 243, 252, 1)',
                                fontFamily: 'monospace',
                                outline: 'none',
                                width: '100%',
                                minWidth: 0,
                            }}
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
