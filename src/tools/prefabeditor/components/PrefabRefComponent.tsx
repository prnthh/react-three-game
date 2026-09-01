import { useCallback, useEffect, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import type { Prefab } from '../types';
import { RuntimeNodeIdScope, useNode, usePrefab } from '../SceneContext';
import { useEditorRef } from '../EditorContext';
import { useEditSelection } from '../SelectionRuntime';
import { normalizePrefab, scopePrefabMaterials, type PrefabState } from '../prefab';
import { createPrefabStore, type PrefabStoreApi } from '../prefabStore';
import { withBasePath } from '../utils';
import { base, colors } from '../styles';
import { FieldGroup, Label } from './Input';
import { PrefabRoot } from '../PrefabRoot';
import { useTrackSceneLoad } from '../assetRuntime';

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

const prefabCache = new Map<string, Promise<PrefabState>>();

function loadPrefab(url: string) {
    const current = prefabCache.get(url);
    if (current) return current;
    const request = fetchJson<Prefab>(url).then(normalizePrefab);
    prefabCache.set(url, request);
    void request.catch(() => prefabCache.delete(url));
    return request;
}

function PrefabRefView({ properties, enabled, children }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const { editMode, nodeId } = useNode();
    const selectEditorNode = useEditSelection();
    const [store, setStore] = useState<PrefabStoreApi | null>(null);
    const trackSceneLoad = useTrackSceneLoad();
    const url = properties.url ? withBasePath(basePath, properties.url) : '';

    useEffect(() => {
        let active = true;
        setStore(null);
        if (url) void trackSceneLoad(loadPrefab(url)).then(value => {
            if (active) setStore(createPrefabStore(value));
        }).catch(error => console.warn('[PrefabRef] Failed to load:', url, error));
        return () => { active = false; };
    }, [trackSceneLoad, url]);

    const selectPlacement = useCallback((event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4) return;
        event.stopPropagation();
        selectEditorNode?.(nodeId);
    }, [nodeId, selectEditorNode]);

    return <>
        {store && (
            <group onClick={editMode && selectEditorNode ? selectPlacement : undefined}>
                <RuntimeNodeIdScope prefix={nodeId}>
                    <PrefabRoot store={store} basePath={basePath} enabled={enabled} />
                </RuntimeNodeIdScope>
            </group>
        )}
        {children}
    </>;
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
