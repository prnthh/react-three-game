import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import type { Prefab } from '../types';
import { RuntimeNodeIdScope, useNode, usePrefab } from '../SceneContext';
import { useEditorRef } from '../EditorContext';
import { useEditSelection } from '../SelectionRuntime';
import { scopePrefabMaterials } from '../prefab';
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

function PrefabRefView({ properties, enabled, children }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const { editMode, nodeId } = useNode();
    const selectEditorNode = useEditSelection();
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab | null>(null);
    const selectPlacement = useCallback((event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4) return;
        event.stopPropagation();
        selectEditorNode?.(nodeId);
    }, [nodeId, selectEditorNode]);

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
                <group onClick={editMode && selectEditorNode ? selectPlacement : undefined}>
                    <Suspense fallback={null}>
                        <RuntimeNodeIdScope prefix={nodeId}>
                            <PrefabRoot data={loadedPrefab} basePath={basePath} enabled={enabled} />
                        </RuntimeNodeIdScope>
                    </Suspense>
                </group>
            )}
            {children}
        </>
    );
}

function PrefabRefEditor({ node, properties, update }: ComponentEditorProps<PrefabRefProperties>) {
    const url = properties.url ?? '';
    const [manifest, setManifest] = useState<string[]>([]);
    const [unpacking, setUnpacking] = useState(false);
    const editor = useEditorRef();
    const { basePath } = editor;

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
            const scoped = scopePrefabMaterials(prefab, node.id);
            Object.entries(scoped.materials ?? {}).forEach(([id, material]) => {
                editor.setMaterial(id, material);
            });
            editor.replaceNode(node.id, scoped.root);
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
                    onChange={e => update({ url: e.target.value })}
                    placeholder="/prefabs/my-prefab.json"
                />
                {manifest.length > 0 && (
                    <select
                        style={{ ...base.input, width: '100%', marginTop: 4, background: colors.bgInput, boxSizing: 'border-box' }}
                        value={url}
                        onChange={e => update({ url: e.target.value })}
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

const PrefabRefComponent: Component<PrefabRefProperties> = {
    name: 'PrefabRef',
    renderWhenDisabled: true,
    Editor: PrefabRefEditor,
    View: PrefabRefView,
    properties: {
        url: { type: 'string', default: '' },
    },
};

export default PrefabRefComponent;
