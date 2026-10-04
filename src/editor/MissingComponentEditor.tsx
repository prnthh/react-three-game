import { useId, useState } from 'react';
import type { ComponentData } from '../core/types.js';
import { base, colors, componentCard } from './ui/styles.js';

function parseComponent(text: string): ComponentData {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Component must be a JSON object.');
    }
    const component = value as Record<string, unknown>;
    if (typeof component.type !== 'string' || !component.type.trim()) {
        throw new Error('Type must be a non-empty string.');
    }
    if (!component.properties || typeof component.properties !== 'object' || Array.isArray(component.properties)) {
        throw new Error('Properties must be a JSON object.');
    }
    return { ...component, type: component.type, properties: component.properties };
}

export function MissingComponentEditor({ component, componentKey, onSave }: {
    component: ComponentData;
    componentKey: string;
    onSave: (component: ComponentData) => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const errorId = useId();
    let parsed: ComponentData | undefined;
    let error = '';
    if (draft !== null) {
        try { parsed = parseComponent(draft); }
        catch (reason) { error = reason instanceof Error ? reason.message : 'Invalid JSON.'; }
    }
    return <div style={componentCard.container}>
        <div style={{ color: colors.danger, fontSize: 11, overflowWrap: 'anywhere' }}>
            Missing component: {component.type}
        </div>
        <div style={{ ...base.label, marginTop: 3 }}>{componentKey}</div>
        {draft === null ? <button type="button" style={{ ...base.btn, marginTop: 7 }}
            onClick={() => setDraft(JSON.stringify(component, null, 2))}>Edit as JSON</button> : <>
            <textarea autoFocus aria-label={`${componentKey} component JSON`} value={draft} rows={10}
                aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
                spellCheck={false}
                style={{ ...base.input, width: '100%', boxSizing: 'border-box', marginTop: 7,
                    fontFamily: 'monospace', resize: 'vertical' }}
                onChange={event => setDraft(event.target.value)} />
            {error && <div id={errorId} role="alert" style={{ color: colors.danger, fontSize: 11, marginTop: 5 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button type="button" style={base.btn} disabled={!parsed}
                    onClick={() => { if (parsed) { onSave(parsed); setDraft(null); } }}>Save</button>
                <button type="button" style={base.btn} onClick={() => setDraft(null)}>Cancel</button>
            </div>
        </>}
    </div>;
}
