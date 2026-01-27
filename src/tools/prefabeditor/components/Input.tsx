import React, { useEffect, useRef, useState } from 'react';

// ============================================================================
// Field Definition Types
// ============================================================================

export type FieldType = 'vector3' | 'number' | 'string' | 'color' | 'boolean' | 'select';

interface BaseFieldDefinition {
    name: string;
    label: string;
}

interface Vector3FieldDefinition extends BaseFieldDefinition {
    type: 'vector3';
    snap?: number;
}

interface NumberFieldDefinition extends BaseFieldDefinition {
    type: 'number';
    min?: number;
    max?: number;
    step?: number;
}

interface StringFieldDefinition extends BaseFieldDefinition {
    type: 'string';
    placeholder?: string;
}

interface ColorFieldDefinition extends BaseFieldDefinition {
    type: 'color';
}

interface BooleanFieldDefinition extends BaseFieldDefinition {
    type: 'boolean';
}

interface SelectFieldDefinition extends BaseFieldDefinition {
    type: 'select';
    options: { value: string; label: string }[];
}

interface CustomFieldDefinition extends BaseFieldDefinition {
    type: 'custom';
    render: (props: {
        value: any;
        onChange: (value: any) => void;
        values: Record<string, any>;
        onChangeMultiple: (values: Record<string, any>) => void;
    }) => React.ReactNode;
}

export type FieldDefinition =
    | Vector3FieldDefinition
    | NumberFieldDefinition
    | StringFieldDefinition
    | ColorFieldDefinition
    | BooleanFieldDefinition
    | SelectFieldDefinition
    | CustomFieldDefinition;

// ============================================================================
// Shared Styles
// ============================================================================

// Shared styles
const styles = {
    input: {
        width: '80px',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
        textAlign: 'right',
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '9px',
        color: 'rgba(34, 211, 238, 0.9)',
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
    label?: string;
}

export function Input({ value, onChange, step, min, max, style, label }: InputProps) {
    const [draft, setDraft] = useState<string>(() => value.toString());

    useEffect(() => {
        setDraft(value.toString());
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setDraft(inputValue);

        const num = parseFloat(inputValue);
        if (Number.isFinite(num)) {
            onChange(num);
        }
    };

    const handleBlur = () => {
        const num = parseFloat(draft);
        if (!Number.isFinite(num)) {
            setDraft(value.toString());
        }
    };

    const dragState = useRef<{
        startX: number;
        startValue: number;
    } | null>(null);

    const startScrub = (e: React.PointerEvent) => {
        if (!label) return;
        e.preventDefault();

        dragState.current = {
            startX: e.clientX,
            startValue: value
        };

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        document.body.style.cursor = "ew-resize";
    };

    const onScrubMove = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        const { startX, startValue } = dragState.current;
        const dx = e.clientX - startX;

        let speed = 0.02;
        if (e.shiftKey) speed *= 0.1; // fine
        if (e.altKey) speed *= 5;     // coarse

        let nextValue = startValue + dx * speed;

        // Apply min/max constraints
        if (min !== undefined && nextValue < min) nextValue = min;
        if (max !== undefined && nextValue > max) nextValue = max;

        setDraft(nextValue.toFixed(3));
        onChange(nextValue);
    };

    const endScrub = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        dragState.current = null;
        document.body.style.cursor = "";
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    if (label) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <span
                    style={{
                        ...styles.label,
                        marginBottom: 0,
                        cursor: 'ew-resize',
                        userSelect: 'none',
                        flex: '0 0 auto',
                        minWidth: 20,
                    }}
                    onPointerDown={startScrub}
                    onPointerMove={onScrubMove}
                    onPointerUp={endScrub}
                >
                    {label}
                </span>
                <input
                    type="text"
                    value={draft}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    step={step}
                    min={min}
                    max={max}
                    style={{ ...styles.input, ...style }}
                />
            </div>
        );
    }

    return (
        <input
            type="text"
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={e => {
                if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                }
            }}
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
    onChange,
    snap
}: {
    label: string;
    value: [number, number, number];
    onChange: (v: [number, number, number]) => void;
    snap?: number;
}) {
    const snapValue = (num: number) => {
        if (!snap) return num;
        return Math.round(num / snap) * snap;
    };

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
            next[index] = snapValue(num);
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

        const rawValue = startValue + dx * speed;
        const nextValue = snapValue(rawValue);
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

// ============================================================================
// Additional Input Components
// ============================================================================

export function ColorInput({
    label,
    value,
    onChange
}: {
    label?: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            {label && <Label>{label}</Label>}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                <input
                    type="color"
                    style={{
                        height: 32,
                        width: 48,
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(34, 211, 238, 0.3)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                    }}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
                <input
                    type="text"
                    style={{ ...styles.input, }}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
            </div>
        </div>
    );
}

export function StringInput({
    label,
    value,
    onChange,
    placeholder
}: {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <div>
            {label && <Label>{label}</Label>}
            <input
                type="text"
                style={styles.input}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
            />
        </div>
    );
}

export function BooleanInput({
    label,
    value,
    onChange
}: {
    label?: string;
    value: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {label && <Label>{label}</Label>}
            <input
                type="checkbox"
                style={{
                    height: 16,
                    width: 16,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(34, 211, 238, 0.3)',
                    cursor: 'pointer',
                }}
                checked={value}
                onChange={e => onChange(e.target.checked)}
            />
        </div>
    );
}

export function SelectInput({
    label,
    value,
    onChange,
    options
}: {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {label && <Label>{label}</Label>}
            <select
                style={styles.input as React.CSSProperties}
                value={value}
                onChange={e => onChange(e.target.value)}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

// ============================================================================
// Field Renderer - Schema-driven UI generation
// ============================================================================

interface FieldRendererProps {
    fields: FieldDefinition[];
    values: Record<string, any>;
    onChange: (values: Record<string, any>) => void;
}

export function FieldRenderer({ fields, values, onChange }: FieldRendererProps) {
    const updateField = (name: string, value: any) => {
        onChange({ [name]: value });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fields.map(field => {
                const value = values[field.name];

                switch (field.type) {
                    case 'vector3':
                        return (
                            <Vector3Input
                                key={field.name}
                                label={field.label}
                                value={value ?? [0, 0, 0]}
                                onChange={v => updateField(field.name, v)}
                                snap={field.snap}
                            />
                        );

                    case 'number':
                        return (
                            <Input
                                key={field.name}
                                label={field.label}
                                value={value ?? 0}
                                onChange={v => updateField(field.name, v)}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                            />
                        );

                    case 'string':
                        return (
                            <StringInput
                                key={field.name}
                                label={field.label}
                                value={value ?? ''}
                                onChange={v => updateField(field.name, v)}
                                placeholder={field.placeholder}
                            />
                        );

                    case 'color':
                        return (
                            <ColorInput
                                key={field.name}
                                label={field.label}
                                value={value ?? '#ffffff'}
                                onChange={v => updateField(field.name, v)}
                            />
                        );

                    case 'boolean':
                        return (
                            <BooleanInput
                                key={field.name}
                                label={field.label}
                                value={value ?? false}
                                onChange={v => updateField(field.name, v)}
                            />
                        );

                    case 'select':
                        return (
                            <SelectInput
                                key={field.name}
                                label={field.label}
                                value={value ?? field.options[0]?.value ?? ''}
                                onChange={v => updateField(field.name, v)}
                                options={field.options}
                            />
                        );

                    case 'custom':
                        return (
                            <div key={field.name}>
                                {field.label && <Label>{field.label}</Label>}
                                {field.render({
                                    value,
                                    onChange: v => updateField(field.name, v),
                                    values,
                                    onChangeMultiple: onChange,
                                })}
                            </div>
                        );

                    default:
                        return null;
                }
            })}
        </div>
    );
}

// Export styles for use in custom field renderers
export { styles };
