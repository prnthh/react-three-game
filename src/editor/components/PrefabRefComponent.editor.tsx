import { useEffect, useState } from 'react';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { useEditorRef } from '../EditorContext.js';
import { loadAssetManifest } from '../../runtime/assets/assetManifest.js';
import { base, colors } from '../ui/styles.js';
import { FieldGroup, Label } from '../ui/Input.js';
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
    const [unpacking, setUnpacking] = useState(false);
    const editor = useEditorRef();
    const { basePath } = editor;

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
                <Label>{inline ? 'Prefab (saved with scene)' : 'Prefab URL'}</Label>
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
                <input
                    type="text"
                    style={{ ...base.input, width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    value={inline ? '' : url}
                    onChange={e => update({ url: e.target.value, prefabId: '' })}
                    placeholder="/prefabs/my-prefab.json"
                />
                {manifest.length > 0 && (
                    <select
                        style={{ ...base.input, width: '100%', marginTop: 4, background: colors.bgInput, boxSizing: 'border-box' }}
                        value={url}
                        onChange={e => update({ url: e.target.value, prefabId: '' })}
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
