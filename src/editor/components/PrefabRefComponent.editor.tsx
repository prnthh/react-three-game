import { useEffect, useState } from 'react';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { useEditorRef } from '../EditorContext.js';
import { loadAssetManifest } from '../../runtime/assets/assetManifest.js';
import { base, colors } from '../ui/styles.js';
import { FieldGroup, Label } from '../ui/Input.js';
import { isEmbeddedPrefabSource } from '../../runtime/prefabs/prefabSource.js';
import { useAssetRuntime } from '../../runtime/assets/AssetRuntime.js';
import { usePrefabStore } from '../../runtime/prefabs/PrefabStoreContext.js';
import { PrefabRefProperties } from "../../runtime/components/PrefabRefComponent.js";

function PrefabRefEditor({ node, properties, update }: ComponentEditorProps<PrefabRefProperties>) {
    const url = properties.url ?? '';
    const prefabId = properties.prefabId ?? '';
    const definitions = usePrefabStore(state => state.prefabs);
    const inline = !!prefabId;
    const hasSource = inline || !!url;
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

        void loadAssetManifest(basePath)
            .then((data) => {
                if (cancelled) return;
                setManifest(data.prefabs);
            })
            .catch(() => {
                if (!cancelled) setManifest([]);
            });

        return () => {
            cancelled = true;
        };
    }, [basePath]);

    const handleUnpack = async () => {
        if (!node || !hasSource) return;
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
                <Label>{inline || embedded ? 'Prefab (saved with scene)' : 'Prefab URL'}</Label>
                {inline && <div>{definitions?.[prefabId]?.name ?? prefabId}</div>}
                {!!Object.keys(definitions ?? {}).length && <select
                    style={{ ...base.input, width: '100%', marginBottom: 4 }}
                    value={prefabId}
                    onChange={e => update({ prefabId: e.target.value, url: '' })}
                >
                    <option value="">— inline definition —</option>
                    {Object.entries(definitions ?? {}).map(([id, prefab]) => <option key={id} value={id}>
                        {prefab.name ?? id} ({id})
                    </option>)}
                </select>}
                {embedded && <div title={embeddedLabel} style={{ overflowWrap: 'anywhere', marginBottom: 4 }}>{embeddedLabel}</div>}
                <input
                    type="text"
                    style={{ ...base.input, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    value={inline || embedded ? '' : url}
                    onChange={e => update({ url: e.target.value, prefabId: '' })}
                    placeholder={embedded ? "Replace with a prefab URL…" : "/prefabs/my-prefab.json"}
                />
                {manifest.length > 0 && (
                    <select
                        style={{ ...base.input, width: '100%', marginTop: 4, background: colors.bgInput, boxSizing: 'border-box' }}
                        value={url}
                        onChange={e => update({ url: e.target.value, prefabId: '' })}
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
                style={{ ...base.btn, width: '100%', opacity: unpacking || !hasSource ? 0.5 : 1 }}
                disabled={unpacking || !hasSource}
                onClick={handleUnpack}
            >
                {unpacking ? 'Unpacking…' : 'Unpack'}
            </button>
        </FieldGroup>
    );
}

export default PrefabRefEditor;
