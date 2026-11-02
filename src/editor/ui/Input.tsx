import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base, colors, fonts, ui } from './styles.js';
import { usePrefabStore } from "../../runtime/prefabs/PrefabStoreContext.js";

// ============================================================================
// Field Definition Types
// ============================================================================

interface BaseFieldDefinition<Name extends string = string, Value = unknown> {
    /** Allow removing the authored value (undefined). */
    allowUnset?: boolean;
    initialValue?: Value;
    name: Name;
    label: string;
}

interface Vector3FieldDefinition<Name extends string = string> extends BaseFieldDefinition<Name, [number, number, number]> {
    type: 'vector3';
    snap?: number;
}

interface NumberFieldDefinition<Name extends string = string> extends BaseFieldDefinition<Name, number> {
    type: 'number';
    min?: number;
    max?: number;
    step?: number;
}

interface StringFieldDefinition<Name extends string = string> extends BaseFieldDefinition<Name, string> {
    type: 'string';
    placeholder?: string;
}

interface ColorFieldDefinition<Name extends string = string> extends BaseFieldDefinition<Name, string> {
    type: 'color';
}

interface BooleanFieldDefinition<Name extends string = string> extends BaseFieldDefinition<Name, boolean> {
    type: 'boolean';
}

interface SelectFieldDefinition<Name extends string = string, Value extends string = string> extends BaseFieldDefinition<Name, Value> {
    type: 'select';
    options: { value: Value; label: string }[];
}

interface NodeFieldDefinition<Name extends string = string> extends BaseFieldDefinition<Name, string> {
    type: 'node';
    placeholder?: string;
    includeRoot?: boolean;
}

interface CustomFieldDefinition<
    Name extends string = string,
    Value = any,
    Values extends object = Record<string, any>,
> extends BaseFieldDefinition<Name, Value> {
    type: 'custom';
    render: (props: {
        value: Value;
        onChange: (value: Value) => void;
        values: Values;
        onChangeMultiple: (values: Partial<Values>) => void;
    }) => React.ReactNode;
}

type UntypedFieldDefinition =
    | Vector3FieldDefinition
    | NumberFieldDefinition
    | StringFieldDefinition
    | ColorFieldDefinition
    | BooleanFieldDefinition
    | SelectFieldDefinition
    | NodeFieldDefinition
    | CustomFieldDefinition;

type StringValue<Value> = Extract<NonNullable<Value>, string>;

type FieldForProperty<Values extends object, Name extends Extract<keyof Values, string>> =
    | CustomFieldDefinition<Name, Values[Name], Values>
    | ([number, number, number] extends NonNullable<Values[Name]> ? Vector3FieldDefinition<Name> : never)
    | (number extends NonNullable<Values[Name]> ? NumberFieldDefinition<Name> : never)
    | (boolean extends NonNullable<Values[Name]> ? BooleanFieldDefinition<Name> : never)
    | (string extends NonNullable<Values[Name]>
        ? StringFieldDefinition<Name> | ColorFieldDefinition<Name> | NodeFieldDefinition<Name>
        : never)
    | (StringValue<Values[Name]> extends never
        ? never
        : SelectFieldDefinition<Name, StringValue<Values[Name]>>);

/** A field schema checked against the properties it edits. */
export type FieldDefinition<Values extends object> =
    string extends keyof Values
        ? UntypedFieldDefinition
        : {
            [Name in Extract<keyof Values, string>]-?: FieldForProperty<Values, Name>
        }[Extract<keyof Values, string>];

// ============================================================================
// Shared Styles (derived from shared color tokens)
// ============================================================================

const styles = {
    input: {
        ...base.input,
        width: '80px',
        padding: '2px 4px',
        fontSize: 11,
        fontFamily: fonts.mono,
        textAlign: 'right',
    } as React.CSSProperties,
    label: {
        ...base.label,
        display: 'block',
        letterSpacing: '0.05em',
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

function clampNumber(value: number, min?: number, max?: number) {
    if (min !== undefined && value < min) return min;
    if (max !== undefined && value > max) return max;
    return value;
}

function normalizeNumber(value: number, step?: string | number, min?: number, max?: number) {
    const clampedValue = clampNumber(value, min, max);
    const normalizedStep = getNumericStep(step, 0);
    if (!Number.isFinite(normalizedStep) || normalizedStep <= 0) return clampedValue;

    const precision = getStepPrecision(normalizedStep);
    const stepBase = min ?? 0;
    const steppedValue = stepBase + Math.round((clampedValue - stepBase) / normalizedStep) * normalizedStep;

    return Number(steppedValue.toFixed(precision));
}

function isIncompleteNumber(value: string) {
    return value === '' || value === '-' || value === '.' || value === '-.';
}

interface InputProps {
    value: number;
    onChange: (value: number) => void;
    step?: string | number;
    min?: number;
    max?: number;
    style?: React.CSSProperties;
    label?: string;
    /** Keep expensive values local while typing/scrubbing and publish once. */
    commitOnBlur?: boolean;
}

export function NumberInput({ value, onChange, step, min, max, style, commitOnBlur = false }: InputProps) {
    const [draft, setDraft] = useState(() => value.toString());
    const [isFocused, setIsFocused] = useState(false);
    const committedValue = useRef(value);
    const publishedValue = useRef<number | undefined>(undefined);

    useEffect(() => {
        // Keep incomplete local typing only for our own change echo. External
        // edits (API, undo, another control) supersede even a focused draft.
        const ownChange = publishedValue.current === value;
        publishedValue.current = undefined;
        committedValue.current = value;
        if (!isFocused || !ownChange) setDraft(value.toString());
    }, [value, isFocused]);

    const publish = (next: number) => {
        publishedValue.current = next;
        onChange(next);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setDraft(inputValue);

        if (isIncompleteNumber(inputValue)) return;

        const num = Number(inputValue);
        if (!commitOnBlur && Number.isFinite(num)) {
            publish(clampNumber(num, min, max));
        }
    };

    const commitDraft = (inputValue: string) => {
        if (isIncompleteNumber(inputValue)) {
            setDraft(value.toString());
            return;
        }

        const num = Number(inputValue);
        if (!Number.isFinite(num)) {
            setDraft(value.toString());
            return;
        }

        const normalized = normalizeNumber(num, step, min, max);
        setDraft(normalized.toString());

        if (normalized !== committedValue.current) {
            committedValue.current = normalized;
            publish(normalized);
        }
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        commitDraft(event.currentTarget.value);
    };

    const dragState = useRef<{
        startX: number;
        startValue: number;
    } | null>(null);

    const startScrub = (e: React.PointerEvent<HTMLInputElement>) => {
        dragState.current = {
            startX: e.clientX,
            startValue: value
        };

        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.cursor = "ew-resize";
    };

    const onScrubMove = (e: React.PointerEvent<HTMLInputElement>) => {
        if (!dragState.current) return;

        const { startX, startValue } = dragState.current;
        const dx = e.clientX - startX;
        const baseStep = getNumericStep(step, 0.1);
        let scrubStep = baseStep;
        if (e.shiftKey) scrubStep /= 10;
        if (e.altKey) scrubStep *= 10;

        const deltaSteps = Math.round(dx / 8);
        const rawValue = startValue + deltaSteps * scrubStep;
        const nextValue = normalizeNumber(rawValue, scrubStep, min, max);

        setDraft(nextValue.toString());
        if (!commitOnBlur) publish(nextValue);
    };

    const endScrub = (e: React.PointerEvent<HTMLInputElement>) => {
        if (!dragState.current) return;

        dragState.current = null;
        document.body.style.cursor = "";
        e.currentTarget.releasePointerCapture(e.pointerId);

        if (commitOnBlur) commitDraft(e.currentTarget.value);
    };

    return (
        <input
            type="number"
            inputMode="decimal"
            value={draft}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onKeyDown={e => {
                if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                }
            }}
            step={step ?? 'any'}
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

export function FieldRow({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
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
            {children}
        </div>
    );
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
        () => value.map(v => v.toString()) as [string, string, string]
    );

    useEffect(() => {
        setDraft(value.map(v => v.toString()) as [string, string, string]);
    }, [value]);

    const dragState = useRef<{
        index: number;
        startX: number;
        startValue: number;
    } | null>(null);

    const commit = (index: number) => {
        if (isIncompleteNumber(draft[index])) {
            setDraft(value.map(v => v.toString()) as [string, string, string]);
            return;
        }

        const num = Number(draft[index]);
        if (!Number.isFinite(num)) {
            setDraft(value.map(v => v.toString()) as [string, string, string]);
            return;
        }

        const next = [...value] as [number, number, number];
        next[index] = snapValue(num);
        onChange(next);
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
            const copy = [...d] as [string, string, string];
            copy[index] = nextValue.toString();
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
                            borderRadius: base.input.borderRadius,
                            padding: '2px 4px',
                            minHeight: 22,
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
                            type="number"
                            inputMode="decimal"
                            step={snap ?? 'any'}
                            value={draft[index]}
                            onChange={e => {
                                const next = [...draft] as [string, string, string];
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
                        height: 22,
                        width: 48,
                        backgroundColor: colors.bgInput,
                        border: `1px solid ${colors.border}`,
                        borderRadius: base.input.borderRadius,
                        cursor: 'pointer',
                        padding: 1,
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

type SearchOption = {
    value: string;
    label: string;
    description?: string;
    searchText: string;
};

function SearchSuggestionList({
    query,
    options,
    onSelect,
    emptyMessage,
}: {
    query: string;
    options: SearchOption[];
    onSelect: (value: string) => void;
    emptyMessage: string;
}) {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!normalizedQuery) return options.slice(0, 8);
        return options.filter(option => option.searchText.includes(normalizedQuery)).slice(0, 8);
    }, [normalizedQuery, options]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
                type="text"
                style={{ ...styles.input, width: '100%', textAlign: 'left' }}
                value={query}
                onChange={() => undefined}
                readOnly
                aria-hidden
                tabIndex={-1}
                hidden
            />
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    maxHeight: 160,
                    overflowY: 'auto',
                    border: 'none',
                    borderRadius: base.input.borderRadius,
                    background: colors.bgSurface,
                    padding: 2,
                }}
            >
                {filtered.length === 0 ? (
                    <div style={{ fontSize: 11, color: colors.textMuted, padding: '4px 6px' }}>{emptyMessage}</div>
                ) : filtered.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onSelect(option.value)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 2,
                            border: 'none',
                            borderRadius: base.btn.borderRadius,
                            background: colors.bgSurface,
                            color: colors.text,
                            padding: '4px 6px',
                            cursor: 'pointer',
                            textAlign: 'left',
                        }}
                    >
                        <span style={{ fontSize: 11, fontWeight: 500 }}>{option.label}</span>
                        {option.description ? (
                            <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'monospace' }}>{option.description}</span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function NodeInput({
    label,
    value,
    onChange,
    placeholder,
    includeRoot = true,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    includeRoot?: boolean;
}) {
    const nodesById = usePrefabStore(state => state.nodesById);
    const rootId = usePrefabStore(state => state.rootId);
    const [query, setQuery] = useState('');

    const options = useMemo<SearchOption[]>(() => {
        return Object.values(nodesById)
            .filter(node => includeRoot || node.id !== rootId)
            .map(node => {
                const nodeName = typeof node.name === 'string' && node.name.trim().length > 0 ? node.name.trim() : '(unnamed)';
                return {
                    value: node.id,
                    label: nodeName,
                    description: node.id,
                    searchText: `${nodeName} ${node.id}`.toLowerCase(),
                };
            })
            .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
    }, [includeRoot, nodesById, rootId]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StringInput
                label={label}
                value={value}
                onChange={onChange}
                placeholder={placeholder ?? 'Node id'}
            />
            {options.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input
                        type="text"
                        style={{ ...styles.input, width: '100%', textAlign: 'left' }}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search nodes by name or id"
                    />
                    <SearchSuggestionList
                        query={query}
                        options={options}
                        onSelect={(nextValue) => {
                            onChange(nextValue);
                            setQuery('');
                        }}
                        emptyMessage="No matching nodes."
                    />
                </div>
            ) : null}
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
                    borderRadius: base.input.borderRadius,
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

type FieldNameFor<Values extends object, Value> = string extends keyof Values
    ? string
    : {
        [Name in Extract<keyof Values, string>]-?: Value extends NonNullable<Values[Name]> ? Name : never
    }[Extract<keyof Values, string>];

type SelectFieldName<Values extends object> = string extends keyof Values
    ? string
    : {
        [Name in Extract<keyof Values, string>]-?: StringValue<Values[Name]> extends never ? never : Name
    }[Extract<keyof Values, string>];

interface BoundFieldProps<Values extends object, Value> {
    allowUnset?: boolean;
    name: FieldNameFor<Values, Value>;
    values: Values;
    onChange: (values: Partial<Values>) => void;
}

interface BoundNumberFieldProps<Values extends object> extends BoundFieldProps<Values, number> {
    label: string;
    fallback?: number;
    step?: string | number;
    min?: number;
    max?: number;
    style?: React.CSSProperties;
    commitOnBlur?: boolean;
}

interface BoundStringFieldProps<Values extends object> extends BoundFieldProps<Values, string> {
    label: string;
    fallback?: string;
    placeholder?: string;
}

interface BoundColorFieldProps<Values extends object> extends BoundFieldProps<Values, string> {
    label: string;
    fallback?: string;
}

interface BoundBooleanFieldProps<Values extends object> extends BoundFieldProps<Values, boolean> {
    label: string;
    fallback?: boolean;
}

type BoundSelectFieldProps<Values extends object> = Omit<BoundFieldProps<Values, string>, 'name'> & {
    name: SelectFieldName<Values>;
    label: string;
    fallback?: string;
    options: { value: string; label: string }[];
};

interface BoundVector3FieldProps<Values extends object> extends BoundFieldProps<Values, [number, number, number]> {
    label: string;
    fallback?: [number, number, number];
    snap?: number;
    labelExtra?: React.ReactNode;
}

function bindFieldChange<Values extends object>(name: string, onChange: (values: Partial<Values>) => void) {
    return (value: unknown) => onChange({ [name]: value } as Partial<Values>);
}

/** Shared optional-value control for schema fields and custom inspector inputs. */
export function UnsettableField<Value>({ allowUnset = false, label, value, initialValue, onChange, children }: {
    allowUnset?: boolean;
    label: string;
    value: Value | undefined;
    initialValue: Value;
    onChange: (value: Value | undefined) => void;
    children: React.ReactNode;
}) {
    if (!allowUnset) return children;
    if (value === undefined) return <FieldRow label={label}>
        <span style={{ color: colors.textMuted, fontSize: 11 }}>Unset</span>
        <button type="button" style={base.btn} aria-label={`Set ${label.toLowerCase()}`}
            onClick={() => onChange(initialValue)}>Set</button>
    </FieldRow>;
    return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        <button type="button" style={{ ...base.btn, padding: '2px 5px' }}
            aria-label={`Unset ${label.toLowerCase()}`} title="Unset this field to inherit its default"
            onClick={() => onChange(undefined)}>↺</button>
    </div>;
}

function getFieldValue(values: object, name: string) {
    return (values as Record<string, any>)[name];
}

export function FieldGroup({ children }: { children: React.ReactNode }) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>;
}

interface ListEditorOption {
    value: string;
    label: string;
}

interface ListEditorProps<T> {
    label: string;
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    onAdd: (value: string) => void;
    addOptions?: ListEditorOption[];
    emptyMessage?: string;
    canAdd?: boolean;
    addButtonTitle?: string;
    addDisabledTitle?: string;
}

export function ListEditor<T>({
    label,
    items,
    renderItem,
    onAdd,
    addOptions = [],
    emptyMessage = 'No items added.',
    canAdd = true,
    addButtonTitle = 'Add item',
    addDisabledTitle = 'No more items available',
}: ListEditorProps<T>) {
    const [selectedAddValue, setSelectedAddValue] = useState('');
    const hasAddSelector = addOptions.length > 0;
    const resolvedAddValue = hasAddSelector ? (selectedAddValue || addOptions[0]?.value || '') : '';
    const canAddItem = canAdd && (!hasAddSelector || resolvedAddValue !== '');

    useEffect(() => {
        if (!hasAddSelector) {
            if (selectedAddValue !== '') {
                setSelectedAddValue('');
            }
            return;
        }

        const stillAvailable = addOptions.some(option => option.value === selectedAddValue);
        if (!stillAvailable) {
            setSelectedAddValue(addOptions[0]?.value ?? '');
        }
    }, [addOptions, hasAddSelector, selectedAddValue]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Label>{label}</Label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {hasAddSelector ? (
                        <div style={{ minWidth: 140 }}>
                            <SelectInput
                                value={resolvedAddValue}
                                onChange={setSelectedAddValue}
                                options={canAdd ? addOptions : [{ value: '', label: 'All items added' }]}
                            />
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => onAdd(resolvedAddValue)}
                        disabled={!canAddItem}
                        style={{
                            ...ui.compactActionButton,
                            width: 22,
                            minWidth: 22,
                            height: 22,
                            border: `1px solid ${canAddItem ? colors.accentBorder : colors.border}`,
                            background: canAddItem ? colors.accentBg : colors.bgSurface,
                            color: canAddItem ? colors.accent : colors.textMuted,
                            cursor: canAddItem ? 'pointer' : 'not-allowed',
                            fontSize: 14,
                            lineHeight: 1,
                        }}
                        title={canAddItem ? addButtonTitle : addDisabledTitle}
                    >
                        +
                    </button>
                </div>
            </div>
            {items.length === 0 ? (
                <div style={{ fontSize: 11, color: colors.textMuted }}>{emptyMessage}</div>
            ) : null}
            {items.map(renderItem)}
        </div>
    );
}

export function NumberField<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback = 0,
    step,
    min,
    max,
    style,
    commitOnBlur,
}: BoundNumberFieldProps<Values>) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={Math.min(max ?? Infinity, Math.max(min ?? -Infinity, fallback))} onChange={bindFieldChange(name, onChange)}>
        <FieldRow label={label}>
            <NumberInput
                value={getFieldValue(values, name) ?? fallback}
                onChange={bindFieldChange(name, onChange)}
                step={step}
                min={min}
                max={max}
                style={style}
                commitOnBlur={commitOnBlur}
            />
        </FieldRow>
    </UnsettableField>;
}

export function StringField<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback = '',
    placeholder,
}: BoundStringFieldProps<Values>) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={fallback} onChange={bindFieldChange(name, onChange)}>
        <StringInput
            label={label}
            value={getFieldValue(values, name) ?? fallback}
            onChange={bindFieldChange(name, onChange)}
            placeholder={placeholder}
        />
    </UnsettableField>;
}

export function ColorField<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback = '#ffffff',
}: BoundColorFieldProps<Values>) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={fallback} onChange={bindFieldChange(name, onChange)}>
        <ColorInput
            label={label}
            value={getFieldValue(values, name) ?? fallback}
            onChange={bindFieldChange(name, onChange)}
        />
    </UnsettableField>;
}

export function BooleanField<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback = false,
}: BoundBooleanFieldProps<Values>) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={fallback} onChange={bindFieldChange(name, onChange)}>
        <BooleanInput
            label={label}
            value={getFieldValue(values, name) ?? fallback}
            onChange={bindFieldChange(name, onChange)}
        />
    </UnsettableField>;
}

export function SelectField<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback,
    options,
}: BoundSelectFieldProps<Values>) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={fallback ?? options[0]?.value ?? ''} onChange={bindFieldChange(name, onChange)}>
        <SelectInput
            label={label}
            value={getFieldValue(values, name) ?? fallback ?? options[0]?.value ?? ''}
            onChange={bindFieldChange(name, onChange)}
            options={options}
        />
    </UnsettableField>;
}

export function NodeField<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback = '',
    placeholder,
    includeRoot,
}: BoundStringFieldProps<Values> & { includeRoot?: boolean }) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={fallback} onChange={bindFieldChange(name, onChange)}>
        <NodeInput
            label={label}
            placeholder={placeholder}
            includeRoot={includeRoot}
            value={getFieldValue(values, name) ?? fallback}
            onChange={bindFieldChange(name, onChange)}
        />
    </UnsettableField>;
}

export function Vector3Field<Values extends object>({
    name,
    label,
    values,
    onChange,
    allowUnset,
    fallback = [0, 0, 0],
    snap,
    labelExtra,
}: BoundVector3FieldProps<Values>) {
    return <UnsettableField allowUnset={allowUnset} label={label} value={getFieldValue(values, name)}
        initialValue={fallback} onChange={bindFieldChange(name, onChange)}>
        <Vector3Input
            label={label}
            value={getFieldValue(values, name) ?? fallback}
            onChange={bindFieldChange(name, onChange)}
            snap={snap}
            labelExtra={labelExtra}
        />
    </UnsettableField>;
}

// ============================================================================
// Field Renderer - Schema-driven UI generation
// ============================================================================

interface FieldRendererProps<Values extends object> {
    fields: readonly FieldDefinition<NoInfer<Values>>[];
    values: Values;
    onChange: (values: Partial<Values>) => void;
}

export function FieldRenderer<Values extends object>({ fields, values, onChange }: FieldRendererProps<Values>) {
    const update = (patch: Record<string, unknown>) => onChange(patch as Partial<Values>);
    return <FieldGroup>{fields.map(typedField => {
        const field = typedField as UntypedFieldDefinition;
        const props = { name: field.name, label: field.label, allowUnset: field.allowUnset, values: values as Record<string, any>, onChange: update };
        switch (field.type) {
            case 'number':
                return <NumberField key={field.name} {...props} min={field.min} max={field.max} step={field.step}
                    fallback={field.initialValue ?? (field.allowUnset ? 1 : 0)} />;
            case 'string':
                return <StringField key={field.name} {...props} placeholder={field.placeholder} fallback={field.initialValue} />;
            case 'color':
                return <ColorField key={field.name} {...props} fallback={field.initialValue} />;
            case 'boolean':
                return <BooleanField key={field.name} {...props} fallback={field.initialValue ?? !!field.allowUnset} />;
            case 'select':
                return <SelectField key={field.name} {...props} options={field.options} fallback={field.initialValue} />;
            case 'vector3':
                return <Vector3Field key={field.name} {...props} snap={field.snap} fallback={field.initialValue} />;
            case 'node':
                return <NodeField key={field.name} {...props} placeholder={field.placeholder} includeRoot={field.includeRoot} fallback={field.initialValue} />;
            case 'custom': {
                const value = getFieldValue(values, field.name);
                return <UnsettableField key={field.name} label={field.label} allowUnset={field.allowUnset}
                    value={value} initialValue={field.initialValue} onChange={value => update({ [field.name]: value })}>
                    {(!field.allowUnset || value !== undefined) && <div>
                        {field.label && <Label>{field.label}</Label>}
                        {field.render({ value, values, onChange: value => update({ [field.name]: value }), onChangeMultiple: update })}
                    </div>}
                </UnsettableField>;
            }
        }
    })}</FieldGroup>;
}

// Export styles for use in custom field renderers
export { styles };
