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

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response.json() as Promise<T>;
}

function PrefabRefView({ properties, children, basePath = '' }: ComponentViewProps<PrefabRefProperties>) {
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null);

    const resolvedUrl = properties.url ? withBasePath(basePath, properties.url) : '';

    useEffect(() => {
        if (!resolvedUrl) {
            setLoadedPrefab(null);
            return;
        }

        let cancelled = false;

        void fetchJson<Prefab>(resolvedUrl)
            .then((data) => {
                if (!cancelled) setLoadedPrefab(data);
            })
            .catch((err) => {
                if (!cancelled) setLoadedPrefab(null);
                console.warn('[PrefabRef] Failed to load:', resolvedUrl, err);
            });

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
        let cancelled = false;

        void fetchJson<unknown>(withBasePath(basePath, '/prefabs/manifest.json'))
            .then((data) => {
                if (cancelled) return;
                setManifest(Array.isArray(data) ? data.filter((entry): entry is string => typeof entry === 'string') : []);
            })
            .catch(() => {
                if (!cancelled) setManifest([]);
            });

        return () => {
            cancelled = true;
        };
    }, [basePath]);

    const handleUnpack = async () => {
        if (!node || !url) return;
        setUnpacking(true);
        try {
            const prefab = await fetchJson<Prefab>(withBasePath(basePath, url));
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
