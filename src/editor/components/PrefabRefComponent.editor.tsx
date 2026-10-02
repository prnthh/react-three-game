import { useEffect, useState } from 'react';
import type { ComponentEditorProps } from '../../core/ComponentRegistry';
import { useEditorRef } from '../EditorContext';
import { withBasePath } from '../../runtime/assets/assetPaths';
import { base, colors } from '../ui/styles';
import { FieldGroup, Label } from '../ui/Input';
import { isEmbeddedPrefabSource } from '../../runtime/prefabs/prefabSource';
import { useAssetRuntime } from '../../runtime/assets/AssetRuntime';
import { PrefabRefProperties } from "../../runtime/components/PrefabRefComponent";

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response.json() as Promise<T>;
}

function PrefabRefEditor({ node, properties, update }: ComponentEditorProps<PrefabRefProperties>) {
    const url = properties.url ?? '';
    const [manifest, setManifest] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const embedded = isEmbeddedPrefabSource(url);
    const runtime = useAssetRuntime();
    const [sourceName, setSourceName] = useState<{ url: string; name: string } | null>(null);
    const embeddedLabel = sourceName?.url === url ? sourceName.name : 'Loading prefab…';
    const [unpacking, setUnpacking] = useState(false);
    const editor = useEditorRef();
    const { basePath } = editor;

    useEffect(() => {
        if (!embedded) return;
        let active = true;
        void runtime.loadDocument(url).then(document => {
            if (!active) return;
            const name = document.prefabName?.trim() || document.nodesById[document.rootId].name?.trim()
                || document.prefabId || document.rootId;
            setSourceName({ url, name });
        }).catch(() => {
            if (active) setSourceName({ url, name: 'Unavailable prefab' });
        });
        return () => { active = false; };
    }, [embedded, runtime, url]);

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
            setError(null);
            await editor.scene.unpack({ id: node.id });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setUnpacking(false);
        }
    };

    return (
        <FieldGroup>
            <div>
                <Label>{embedded ? 'Prefab (saved with scene)' : 'Prefab URL'}</Label>
                {embedded && <div title={embeddedLabel} style={{ overflowWrap: 'anywhere', marginBottom: 4 }}>{embeddedLabel}</div>}
                <input
                    type="text"
                    style={{ ...base.input, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    value={embedded ? '' : url}
                    onChange={e => update({ url: e.target.value })}
                    placeholder={embedded ? "Replace with a prefab URL…" : "/prefabs/my-prefab.json"}
                />
                {manifest.length > 0 && (
                    <select
                        style={{ ...base.input, width: '100%', marginTop: 4, background: colors.bgInput, boxSizing: 'border-box' }}
                        value={url}
                        onChange={e => update({ url: e.target.value })}
                    >
                        {embedded && <option value={url}>{embeddedLabel} (saved with scene)</option>}
                        <option value="">— pick from manifest —</option>
                        {manifest.map(entry => (
                            <option key={entry} value={entry}>
                                {entry.replace(/^.*\//, '')}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            {error && <div role="alert">{error}</div>}
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

export default PrefabRefEditor;
