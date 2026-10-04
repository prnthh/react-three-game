import { useEffect, useState } from 'react';
import type { RuntimeComponentProperties } from '../../runtime/components/RuntimeComponent.js';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { colors, ui } from '../ui/styles.js';

function ScriptField({ name, value, commit }: { name: string; value: string; commit: (value: string) => void }) {
    const [draft, setDraft] = useState(value);
    const [error, setError] = useState('');
    useEffect(() => { setDraft(value); setError(''); }, [value]);
    return <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
        {name}
        <textarea
            aria-label={name}
            spellCheck={false}
            rows={name === 'data' ? 4 : 6}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={() => {
                try { commit(draft); setError(''); }
                catch (error) { setError(error instanceof Error ? error.message : String(error)); }
            }}
            style={{ ...ui.monoTextInput, width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
        />
        {error && <span role="alert" style={{ color: colors.accent }}>{error}</span>}
    </label>;
}

export default function RuntimeComponentEditor({ properties, update }: ComponentEditorProps<RuntimeComponentProperties>) {
    return <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 11, color: colors.textMuted }}>
            JavaScript bodies run during play. Available: nodeId, node, object, data, state, prefab, events, delta.
            Use setup for an effect that returns cleanup, and update for a frame callback. Setup may run again after cleanup.
        </div>
        <ScriptField name="data" value={JSON.stringify(properties.data ?? {}, null, 2)} commit={source => {
            const data: unknown = JSON.parse(source || '{}');
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Data must be a JSON object.');
            update({ data: data as Record<string, unknown> });
        }} />
        {(['setup', 'update'] as const).map(field => <ScriptField key={field} name={field} value={properties[field] ?? ''}
            commit={source => update({ [field]: source })} />)}
    </div>;
}
