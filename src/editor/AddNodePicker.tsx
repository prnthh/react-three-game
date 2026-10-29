import { useRef, useState, useSyncExternalStore } from 'react';
import { getEditorNodePresets, subscribeEditorNodePresets, type EditorNodePreset } from './NodePresets.js';
import { base, colors } from './ui/styles.js';
import './builtInNodePresets.js';

export function AddNodePicker({ onAdd }: { onAdd: (preset: EditorNodePreset) => void }) {
    const presets = useSyncExternalStore(subscribeEditorNodePresets, getEditorNodePresets, getEditorNodePresets);
    const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [error, setError] = useState('');
    const trigger = useRef<HTMLButtonElement>(null);
    const close = () => { setOpen(false); setQuery(''); setError(''); trigger.current?.focus(); };
    const matches = presets.filter(preset => `${preset.label} ${preset.category} ${preset.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <div style={{ marginTop: 8, width: '100%', minWidth: 0 }} onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
        <button ref={trigger} type="button" style={{ ...base.btn, minHeight: 44, width: '100%' }} aria-expanded={open}
            onClick={() => open ? close() : setOpen(true)}>+ Add object</button>
        {open && <section aria-label="Add object" style={{ ...base.panel, padding: 10, marginTop: 6, maxHeight: '50vh', overflow: 'auto' }}>
            <input autoFocus aria-label="Search objects" placeholder="Search objects…" value={query} onChange={event => setQuery(event.target.value)} style={base.input} />
            {[...new Set(matches.map(preset => preset.category))].map(category => <div key={category} role="group" aria-label={category}>
                <p style={{ ...base.label, margin: '12px 0 6px' }}>{category}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {matches.filter(preset => preset.category === category).map(preset => <button type="button" key={preset.id}
                        style={{ ...base.btn, minHeight: 44, whiteSpace: 'normal' }} title={preset.description}
                        onClick={() => { try { onAdd(preset); close(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } }}>{preset.label}</button>)}
                </div>
            </div>)}
            {!matches.length && <p>No matching objects.</p>}
            {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
        </section>}
    </div>;
}
