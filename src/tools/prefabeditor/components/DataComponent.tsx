import { CSSProperties, useEffect, useState } from "react";
import { Component } from "./ComponentRegistry";
import { colors, ui } from "../styles";

type DataComponentProperties = {
    data?: Record<string, unknown>;
};

const RESERVED_USER_DATA_KEYS = new Set([
    'prefabNodeId',
    'prefabNodeName',
]);

const inputStyle: CSSProperties = {
    ...ui.monoTextInput,
    width: '100%',
    padding: '4px 6px',
    fontSize: '11px',
    outline: 'none',
    boxSizing: 'border-box',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeData(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) return {};

    return Object.entries(value).reduce<Record<string, unknown>>((result, [key, entry]) => {
        if (!key.trim() || entry === undefined) {
            return result;
        }

        result[key] = entry;
        return result;
    }, {});
}

function formatData(value: unknown) {
    return JSON.stringify(normalizeData(value), null, 2);
}

function parseData(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    const trimmed = raw.trim();
    if (!trimmed) {
        return { ok: true, value: {} };
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!isRecord(parsed)) {
            return { ok: false, error: 'Data must be a JSON object' };
        }

        const nextData = normalizeData(parsed);
        for (const key of Object.keys(nextData)) {
            if (RESERVED_USER_DATA_KEYS.has(key)) {
                return { ok: false, error: `Reserved key: ${key}` };
            }
        }

        return { ok: true, value: nextData };
    } catch {
        return { ok: false, error: 'Data must be valid JSON' };
    }
}

function DataComponentEditor({ component, onUpdate }: {
    component: { properties?: DataComponentProperties };
    onUpdate: (newComp: any) => void;
}) {
    const [draft, setDraft] = useState(() => formatData(component.properties?.data));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setDraft(formatData(component.properties?.data));
        setError(null);
    }, [component.properties?.data]);

    const commitDraft = () => {
        const parsed = parseData(draft);
        if (!parsed.ok) {
            setError(parsed.error);
            return;
        }

        setError(null);
        setDraft(formatData(parsed.value));
        onUpdate({ data: parsed.value });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
                rows={10}
                spellCheck={false}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitDraft}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
            />

            {error ? (
                <div style={{ fontSize: 10, color: colors.accent, fontFamily: 'monospace' }}>
                    {error}
                </div>
            ) : null}

            <div style={{ fontSize: 10, color: colors.textMuted, lineHeight: 1.4 }}>
                Enter a JSON object. Keys map directly onto `object.userData`.
            </div>
        </div>
    );
}

const DataComponent: Component = {
    name: 'Data',
    disableSiblingComposition: true,
    Editor: DataComponentEditor,
    defaultProperties: {
        data: {},
    },
};

export default DataComponent;
