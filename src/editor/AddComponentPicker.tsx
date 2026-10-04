import { useEffect, useRef, useState } from 'react';
import type { Component, ComponentCategory } from '../core/ComponentRegistry.js';
import { base, colors, componentCard } from './ui/styles.js';

const categories: Record<ComponentCategory, string> = {
    mesh: 'Mesh',
    materials: 'Materials',
    lighting: 'Lighting',
    camera: 'Camera',
    audio: 'Audio',
    transform: 'Transform',
    physics: 'Physics',
    misc: 'Misc',
};
const slotCategories: Record<NonNullable<Component['slot']>, ComponentCategory> = {
    object: 'mesh', geometry: 'mesh', material: 'materials', transform: 'transform',
    environment: 'lighting', fog: 'lighting', data: 'misc',
};
function categoryOf(component: Component): ComponentCategory {
    return component.category ?? (component.modifyGeometry ? 'mesh'
        : component.slot ? slotCategories[component.slot] : 'misc');
}

export function AddComponentPicker({ components, onAdd }: {
    components: Component[];
    onAdd: (component: Component) => void;
}) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const wasOpen = useRef(false);
    useEffect(() => {
        if (wasOpen.current && !open) button.current?.focus();
        wasOpen.current = open;
    }, [open]);

    if (!open) return <button ref={button} type="button" style={{ ...base.btn, width: '100%' }}
        disabled={!components.length} aria-expanded={false} onClick={() => setOpen(true)}>
        Add component
    </button>;

    return <section aria-label="Add component" style={{ ...componentCard.container, marginBottom: 0 }}
        onKeyDown={event => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 650 }}>Add component</span>
            <button type="button" autoFocus style={base.btn} aria-label="Close component picker"
                onClick={() => setOpen(false)}>✕</button>
        </div>
        {Object.entries(categories).map(([category, label]) => {
            const entries = components.filter(component => categoryOf(component) === category);
            if (!entries.length) return null;
            return <div key={category} role="group" aria-label={label} style={{ marginBottom: 12 }}>
                <div style={{ ...base.label, marginBottom: 5 }}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4 }}>
                    {entries.map(component => <button key={component.name} type="button"
                        title={component.description ?? component.name}
                        style={{ ...base.btn, background: colors.bgLight, minWidth: 0, minHeight: 44,
                            padding: '8px 6px', textAlign: 'left', whiteSpace: 'normal', overflowWrap: 'anywhere' }}
                        onClick={() => { onAdd(component); setOpen(false); }}>
                        {component.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')}
                    </button>)}
                </div>
            </div>;
        })}
    </section>;
}
