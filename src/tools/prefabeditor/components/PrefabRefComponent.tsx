import { lazy, Suspense, useEffect, useState } from 'react';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import type { GameObject, Prefab } from '../types';
import { useEditorRef } from '../EditorContext';
import { withBasePath } from '../utils';
import { base, colors } from '../styles';
import { FieldGroup, Label } from './Input';

const PrefabRoot = lazy(() => import('../PrefabRoot'));

type PrefabRefProperties = {
    url?: string;
};

function PrefabRefView({ properties, children, basePath = '' }: ComponentViewProps<PrefabRefProperties>) {
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null);

    const url = properties.url ?? '';
    const resolvedUrl = url ? withBasePath(basePath, url) : '';

    useEffect(() => {
        if (!resolvedUrl) return;
        let cancelled = false;
        fetch(resolvedUrl)
            .then(r => r.json())
            .then(data => { if (!cancelled) setLoadedPrefab(data as Prefab); })
            .catch(err => console.warn('[PrefabRef] Failed to load:', resolvedUrl, err));
        return () => { cancelled = true; };
    }, [resolvedUrl]);

    return (
        <>
            {loadedPrefab && (
                <Suspense fallback={null}>
                    <PrefabRoot data={loadedPrefab} editMode={false} basePath={basePath} />
                </Suspense>
            )}
            {children}
        </>
    );
}

function PrefabRefEditor({
    node,
    component,
    onUpdate,
    basePath = '',
}: {
    node?: GameObject;
    component: { properties?: PrefabRefProperties };
    onUpdate: (newProps: Record<string, unknown>) => void;
    basePath?: string;
}) {
    const url = component.properties?.url ?? '';
    const [manifest, setManifest] = useState<string[]>([]);
    const [unpacking, setUnpacking] = useState(false);
    const editor = useEditorRef();

    useEffect(() => {
        fetch(withBasePath(basePath, '/prefabs/manifest.json'))
            .then(r => r.json())
            .then(data => setManifest(data))
            .catch(() => setManifest([]));
    }, []);

    const handleUnpack = async () => {
        if (!node || !url) return;
        setUnpacking(true);
        try {
            const prefab = await fetch(withBasePath(basePath, url)).then(r => r.json()) as Prefab;
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
