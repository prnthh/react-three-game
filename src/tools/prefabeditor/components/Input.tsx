import React, { useEffect, useRef, useState } from 'react';
import { colors } from '../styles';

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
// Shared Styles (derived from shared color tokens)
// ============================================================================

const styles = {
    input: {
        width: '80px',
        backgroundColor: colors.bgInput,
        border: `1px solid ${colors.border}`,
        padding: '3px 6px',
        fontSize: '11px',
        color: colors.text,
        fontFamily: 'monospace',
        outline: 'none',
        textAlign: 'right',
        borderRadius: 3,
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '10px',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 2,
        fontWeight: 500,
    } as React.CSSProperties,
};

function getNumericStep(step: string | number | undefined, fallback: number) {
    if (typeof step === 'number' && Number.isFinite(step) && step > 0) return step;

    if (typeof step === 'string') {
        const parsed = parseFloat(step);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    return fallback;
}

function getStepPrecision(step: number) {
    if (!Number.isFinite(step) || step <= 0) return 3;

    const stepString = step.toString();
    if (stepString.includes('e-')) {
        const exponent = stepString.split('e-')[1];
        return exponent ? parseInt(exponent, 10) : 3;
    }

    const decimal = stepString.split('.')[1];
    return decimal?.length ?? 0;
}

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
        dragState.current = {
            startX: e.clientX,
            startValue: value
        };

        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.cursor = "ew-resize";
    };

    const onScrubMove = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        const { startX, startValue } = dragState.current;
        const dx = e.clientX - startX;
        const baseStep = getNumericStep(step, 0.1);
        let scrubStep = baseStep;
        if (e.shiftKey) scrubStep /= 10;
        if (e.altKey) scrubStep *= 10;

        const precision = getStepPrecision(scrubStep);
        const deltaSteps = Math.round(dx / 8);
        let nextValue = startValue + deltaSteps * scrubStep;

        // Apply min/max constraints
        if (min !== undefined && nextValue < min) nextValue = min;
        if (max !== undefined && nextValue > max) nextValue = max;

        setDraft(nextValue.toFixed(precision));
        onChange(nextValue);
    };

    const endScrub = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        dragState.current = null;
        document.body.style.cursor = "";
        e.currentTarget.releasePointerCapture(e.pointerId);
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
                        userSelect: 'none',
                        flex: '0 0 auto',
                        minWidth: 20,
                    }}
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
                    style={{ ...styles.input, cursor: 'ew-resize', ...style }}
                    onPointerDown={startScrub}
                    onPointerMove={onScrubMove}
                    onPointerUp={endScrub}
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
            style={{ ...styles.input, cursor: 'ew-resize', ...style }}
            onPointerDown={startScrub}
            onPointerMove={onScrubMove}
            onPointerUp={endScrub}
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
    snap,
    labelExtra
}: {
    label: string;
    value: [number, number, number];
    onChange: (v: [number, number, number]) => void;
    snap?: number;
    labelExtra?: React.ReactNode;
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
        dragState.current = {
            index,
            startX: e.clientX,
            startValue: value[index]
        };

        e.currentTarget.setPointerCapture(e.pointerId);
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
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const axes = [
        { key: "x", color: '#e06c75', index: 0 },
        { key: "y", color: '#98c379', index: 1 },
        { key: "z", color: '#61afef', index: 2 }
    ] as const;

    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ ...styles.label, marginBottom: 0 }}>{label}</label>
                {labelExtra}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
                {axes.map(({ key, color, index }) => (
                    <div
                        key={key}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: colors.bgInput,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 3,
                            padding: '4px 6px',
                            minHeight: 28,
                            cursor: 'ew-resize',
                        }}
                        onPointerDown={e => startScrub(e, index)}
                        onPointerMove={onScrubMove}
                        onPointerUp={endScrub}
                    >
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color,
                                width: 12,
                                userSelect: 'none',
                            }}
                        >
                            {key.toUpperCase()}
                        </span>
                        <input
                            style={{
                                flex: 1,
                                backgroundColor: 'transparent',
                                border: 'none',
                                fontSize: 11,
                                color: colors.text,
                                fontFamily: 'monospace',
                                outline: 'none',
                                width: '100%',
                                minWidth: 0,
                                cursor: 'inherit',
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
                        backgroundColor: colors.bgInput,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 3,
                        cursor: 'pointer',
                        padding: 2,
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
                    accentColor: colors.accent,
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

interface BoundFieldProps {
    name: string;
    values: Record<string, any>;
    onChange: (values: Record<string, any>) => void;
}

interface BoundNumberFieldProps extends BoundFieldProps {
    label: string;
    fallback?: number;
    step?: string | number;
    min?: number;
    max?: number;
    style?: React.CSSProperties;
}

interface BoundStringFieldProps extends BoundFieldProps {
    label: string;
    fallback?: string;
    placeholder?: string;
}

interface BoundColorFieldProps extends BoundFieldProps {
    label: string;
    fallback?: string;
}

interface BoundBooleanFieldProps extends BoundFieldProps {
    label: string;
    fallback?: boolean;
}

interface BoundSelectFieldProps extends BoundFieldProps {
    label: string;
    fallback?: string;
    options: { value: string; label: string }[];
}

interface BoundVector3FieldProps extends BoundFieldProps {
    label: string;
    fallback?: [number, number, number];
    snap?: number;
    labelExtra?: React.ReactNode;
}

function bindFieldChange(name: string, onChange: (values: Record<string, any>) => void) {
    return (value: any) => onChange({ [name]: value });
}

export function FieldGroup({ children }: { children: React.ReactNode }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>;
}

export function NumberField({
    name,
    label,
    values,
    onChange,
    fallback = 0,
    step,
    min,
    max,
    style,
}: BoundNumberFieldProps) {
    return (
        <Input
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
            step={step}
            min={min}
            max={max}
            style={style}
        />
    );
}

export function StringField({
    name,
    label,
    values,
    onChange,
    fallback = '',
    placeholder,
}: BoundStringFieldProps) {
    return (
        <StringInput
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
            placeholder={placeholder}
        />
    );
}

export function ColorField({
    name,
    label,
    values,
    onChange,
    fallback = '#ffffff',
}: BoundColorFieldProps) {
    return (
        <ColorInput
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
        />
    );
}

export function BooleanField({
    name,
    label,
    values,
    onChange,
    fallback = false,
}: BoundBooleanFieldProps) {
    return (
        <BooleanInput
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
        />
    );
}

export function SelectField({
    name,
    label,
    values,
    onChange,
    fallback,
    options,
}: BoundSelectFieldProps) {
    return (
        <SelectInput
            label={label}
            value={values[name] ?? fallback ?? options[0]?.value ?? ''}
            onChange={bindFieldChange(name, onChange)}
            options={options}
        />
    );
}

export function Vector3Field({
    name,
    label,
    values,
    onChange,
    fallback = [0, 0, 0],
    snap,
    labelExtra,
}: BoundVector3FieldProps) {
    return (
        <Vector3Input
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
            snap={snap}
            labelExtra={labelExtra}
        />
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
