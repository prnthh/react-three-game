import { useEffect, useState } from 'react';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import type { GameObject, Prefab } from '../types';
import PrefabRoot from '../PrefabRoot';
import { useEditorRef } from '../PrefabEditor';
import { base, colors } from '../styles';
import { FieldGroup, Label } from './Input';

type PrefabRefProperties = {
    url?: string;
};

function PrefabRefView({ properties, children }: ComponentViewProps<PrefabRefProperties>) {
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null);

    const url = properties.url ?? '';

    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        fetch(url)
            .then(r => r.json())
            .then(data => { if (!cancelled) setLoadedPrefab(data as Prefab); })
            .catch(err => console.warn('[PrefabRef] Failed to load:', url, err));
        return () => { cancelled = true; };
    }, [url]);

    return (
        <>
            {loadedPrefab && <PrefabRoot data={loadedPrefab} editMode={false} />}
            {children}
        </>
    );
}

function PrefabRefEditor({
    node,
    component,
    onUpdate,
}: {
    node?: GameObject;
    component: { properties?: PrefabRefProperties };
    onUpdate: (newProps: Record<string, unknown>) => void;
}) {
    const url = component.properties?.url ?? '';
    const [manifest, setManifest] = useState<string[]>([]);
    const [unpacking, setUnpacking] = useState(false);
    const editor = useEditorRef();

    useEffect(() => {
        fetch('/prefabs/manifest.json')
            .then(r => r.json())
            .then(data => setManifest(data))
            .catch(() => setManifest([]));
    }, []);

    const handleUnpack = async () => {
        if (!node || !url) return;
        setUnpacking(true);
        try {
            const prefab = await fetch(url).then(r => r.json()) as Prefab;
            editor.replaceNode(node.id, prefab.root);
        } catch (err) {
            console.error('[PrefabRef] Unpack failed:', err);
        } finally {
            setUnpacking(false);
        }
    };

    return (
        <FieldGroup>
            <div>
                <Label>Prefab URL</Label>
                <input
                    type="text"
                    style={{ ...base.input, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    value={url}
                    onChange={e => onUpdate({ url: e.target.value })}
                    placeholder="/prefabs/my-prefab.json"
                />
                {manifest.length > 0 && (
                    <select
                        style={{ ...base.input, width: '100%', marginTop: 4, background: colors.bgInput, boxSizing: 'border-box' }}
                        value={url}
                        onChange={e => onUpdate({ url: e.target.value })}
                    >
                        <option value="">— pick from manifest —</option>
                        {manifest.map(entry => (
                            <option key={entry} value={entry}>
                                {entry.replace(/^.*\//, '')}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            <button
                type="button"
                style={{ ...base.btn, width: '100%', opacity: unpacking || !url ? 0.5 : 1 }}
                disabled={unpacking || !url}
                onClick={handleUnpack}
            >
                {unpacking ? 'Unpacking…' : 'Unpack'}
            </button>
        </FieldGroup>
    );
}

const PrefabRefComponent: Component = {
    name: 'PrefabRef',
    Editor: PrefabRefEditor,
    View: PrefabRefView,
    defaultProperties: {
        url: '',
    },
};

export default PrefabRefComponent;
