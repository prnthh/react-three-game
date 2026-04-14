import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colors } from '../styles';
import { useOptionalPrefabStoreApi } from '../prefabStore';

// ============================================================================
// Field Definition Types
// ============================================================================

export type FieldType = 'vector3' | 'number' | 'string' | 'color' | 'boolean' | 'select' | 'node' | 'event';

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

interface NodeFieldDefinition extends BaseFieldDefinition {
    type: 'node';
    placeholder?: string;
    includeRoot?: boolean;
}

interface EventFieldDefinition extends BaseFieldDefinition {
    type: 'event';
    placeholder?: string;
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
    | NodeFieldDefinition
    | EventFieldDefinition
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
}

export function NumberInput({ value, onChange, step, min, max, style }: InputProps) {
    const [draft, setDraft] = useState(() => value.toString());
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setDraft(value.toString());
        }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setDraft(inputValue);

        if (isIncompleteNumber(inputValue)) return;

        const num = Number(inputValue);
        if (Number.isFinite(num)) {
            onChange(clampNumber(num, min, max));
        }
    };

    const handleBlur = () => {
        setIsFocused(false);

        if (isIncompleteNumber(draft)) {
            setDraft(value.toString());
            return;
        }

        const num = Number(draft);
        if (!Number.isFinite(num)) {
            setDraft(value.toString());
            return;
        }

        const normalized = normalizeNumber(num, step, min, max);
        setDraft(normalized.toString());

        if (normalized !== value) {
            onChange(normalized);
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

        const deltaSteps = Math.round(dx / 8);
        const rawValue = startValue + deltaSteps * scrubStep;
        const nextValue = normalizeNumber(rawValue, scrubStep, min, max);

        setDraft(nextValue.toString());
        onChange(nextValue);
    };

    const endScrub = (e: React.PointerEvent) => {
        if (!dragState.current) return;

        dragState.current = null;
        document.body.style.cursor = "";
        e.currentTarget.releasePointerCapture(e.pointerId);
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

type SearchOption = {
    value: string;
    label: string;
    description?: string;
    searchText: string;
};

function useOptionalPrefabSnapshot() {
    const store = useOptionalPrefabStoreApi();
    const [state, setState] = useState(() => store?.getState() ?? null);

    useEffect(() => {
        if (!store) {
            setState(null);
            return;
        }

        setState(store.getState());
        return store.subscribe(nextState => setState(nextState));
    }, [store]);

    return state;
}

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
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3,
                    background: colors.bgSurface,
                    padding: 4,
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
                            border: `1px solid ${colors.border}`,
                            borderRadius: 3,
                            background: colors.bgInput,
                            color: colors.text,
                            padding: '6px 8px',
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
    const prefabState = useOptionalPrefabSnapshot();
    const [query, setQuery] = useState('');

    const options = useMemo<SearchOption[]>(() => {
        const nodesById = prefabState?.nodesById ?? {};
        const rootId = prefabState?.rootId;

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
    }, [includeRoot, prefabState?.nodesById, prefabState?.rootId]);

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

const BUILT_IN_EVENT_OPTIONS: SearchOption[] = [
    'sensor:enter',
    'sensor:exit',
    'collision:enter',
    'collision:exit',
    'click',
].map(eventName => ({
    value: eventName,
    label: eventName,
    searchText: eventName.toLowerCase(),
}));

export function EventInput({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const prefabState = useOptionalPrefabSnapshot();
    const [query, setQuery] = useState('');

    const options = useMemo<SearchOption[]>(() => {
        const authoredEvents = new Map<string, SearchOption>();

        Object.values(prefabState?.nodesById ?? {}).forEach(node => {
            Object.values(node.components ?? {}).forEach(component => {
                Object.entries(component?.properties ?? {}).forEach(([key, entry]) => {
                    if (typeof entry !== 'string') return;
                    if (!(key === 'eventName' || key.endsWith('EventName'))) return;

                    const eventName = entry.trim();
                    if (!eventName) return;

                    authoredEvents.set(eventName, {
                        value: eventName,
                        label: eventName,
                        description: `${component?.type ?? 'Component'} -> ${key}`,
                        searchText: `${eventName} ${component?.type ?? ''} ${key}`.toLowerCase(),
                    });
                });
            });
        });

        const merged = new Map<string, SearchOption>();
        BUILT_IN_EVENT_OPTIONS.forEach(option => merged.set(option.value, option));
        authoredEvents.forEach((option, key) => merged.set(key, option));

        return [...merged.values()].sort((left, right) => left.value.localeCompare(right.value));
    }, [prefabState?.nodesById]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StringInput
                label={label}
                value={value}
                onChange={onChange}
                placeholder={placeholder ?? 'Event name'}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                    type="text"
                    style={{ ...styles.input, width: '100%', textAlign: 'left' }}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search built-in and authored events"
                />
                <SearchSuggestionList
                    query={query}
                    options={options}
                    onSelect={(nextValue) => {
                        onChange(nextValue);
                        setQuery('');
                    }}
                    emptyMessage="No matching events."
                />
            </div>
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
                            width: 22,
                            height: 22,
                            borderRadius: 3,
                            border: `1px solid ${canAddItem ? colors.accentBorder : colors.border}`,
                            background: canAddItem ? colors.accentBg : colors.bgSurface,
                            color: canAddItem ? colors.accent : colors.textMuted,
                            cursor: canAddItem ? 'pointer' : 'not-allowed',
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                            flexShrink: 0,
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
        <FieldRow label={label}>
            <NumberInput
                value={values[name] ?? fallback}
                onChange={bindFieldChange(name, onChange)}
                step={step}
                min={min}
                max={max}
                style={style}
            />
        </FieldRow>
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

export function NodeField({
    name,
    label,
    values,
    onChange,
    fallback = '',
}: BoundStringFieldProps & { fallback?: string }) {
    return (
        <NodeInput
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
        />
    );
}

export function EventField({
    name,
    label,
    values,
    onChange,
    fallback = '',
    placeholder,
}: BoundStringFieldProps) {
    return (
        <EventInput
            label={label}
            value={values[name] ?? fallback}
            onChange={bindFieldChange(name, onChange)}
            placeholder={placeholder}
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
                            <FieldRow key={field.name} label={field.label}>
                                <NumberInput
                                    value={value ?? 0}
                                    onChange={v => updateField(field.name, v)}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                />
                            </FieldRow>
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

                    case 'node':
                        return (
                            <NodeInput
                                key={field.name}
                                label={field.label}
                                value={value ?? ''}
                                onChange={v => updateField(field.name, v)}
                                placeholder={field.placeholder}
                                includeRoot={field.includeRoot}
                            />
                        );

                    case 'event':
                        return (
                            <EventInput
                                key={field.name}
                                label={field.label}
                                value={value ?? ''}
                                onChange={v => updateField(field.name, v)}
                                placeholder={field.placeholder}
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
