import { useState } from 'react';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { terrainLayers, type TerrainLayer, type TerrainProperties } from '../../runtime/terrain/terrainData.js';
import { FieldGroup, NumberField, StringField, ColorField } from '../ui/Input.js';
import { base, colors } from '../ui/styles.js';

function MapInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const [error, setError] = useState('');
    return <div style={{ display: 'grid', gap: 6, margin: '8px 0' }}>
        <label style={base.label}>{label}
            <input aria-label={`${label} URL`} style={{ ...base.input, marginTop: 5 }} placeholder="Image URL or upload below"
                value={value.startsWith('data:') ? '' : value} onChange={e => onChange(e.target.value)} />
        </label>
        {value.startsWith('data:') && <span style={{ color: colors.textMuted }}>Embedded image (saved with scene)</span>}
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Upload ${label}`} style={{ maxWidth: '100%', minHeight: 36 }}
            onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > 16 * 1024 * 1024) { setError('Choose an image smaller than 16 MB.'); return; }
                const reader = new FileReader();
                reader.onload = () => { setError(''); onChange(String(reader.result)); };
                reader.onerror = () => setError('Could not read this image.');
                reader.readAsDataURL(file);
            }} />
        {value && <button type="button" style={base.btn} onClick={() => onChange('')}>Clear {label}</button>}
        {error && <span role="alert">{error}</span>}
    </div>;
}
export default function TerrainComponentEditor({ node, properties, update }: ComponentEditorProps<TerrainProperties>) {
    const layers = terrainLayers(properties.layers);
    const patchLayer = (index: number, patch: Partial<TerrainLayer>) => update({ layers: layers.map((layer, i) => i === index ? { ...layer, ...patch } : layer) });
    return <FieldGroup>
        <p style={{ color: colors.textMuted, margin: '4px 0' }}>Paint blends between four materials. Height comes from a grayscale map.</p>
        {(['width', 'depth', 'heightScale', 'segments', 'weightResolution'] as const).map(name =>
            <NumberField key={name} name={name} label={({ width: 'Width', depth: 'Depth', heightScale: 'Height scale', segments: 'Mesh segments', weightResolution: 'Weight resolution' })[name]}
                values={properties} onChange={update} min={name === 'heightScale' ? 0 : name === 'weightResolution' ? 16 : 0.1}
                max={name === 'segments' ? 512 : name === 'weightResolution' ? 1024 : 10000} step={name === 'heightScale' ? 0.1 : 1} />)}
        <MapInput label="Height map" value={properties.heightMap ?? ''} onChange={heightMap => update({ heightMap })} />
        <MapInput label="Weight map" value={properties.weightMap ?? ''} onChange={weightMap => update({ weightMap })} />
        <small style={{ color: colors.textMuted }}>Weight PNG: RGB = first three materials; the fourth uses the remaining weight. Keep alpha opaque. Black = material 4.</small>
        {layers.map((layer, index) => <details key={index} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
            <summary style={{ cursor: 'pointer', minHeight: 36 }}>{index + 1}. {layer.name}</summary>
            <StringField name="name" label="Name" values={layer} onChange={patch => patchLayer(index, patch)} />
            <ColorField name="color" label="Tint" values={layer} onChange={patch => patchLayer(index, patch)} />
            <NumberField name="tileSize" label="Tile size" values={layer} onChange={patch => patchLayer(index, patch)} min={0.01} step={0.1} />
            <NumberField name="roughness" label="Roughness" values={layer} onChange={patch => patchLayer(index, patch)} min={0} max={1} step={0.05} />
            <MapInput label={`${layer.name} albedo`} value={layer.albedoMap} onChange={albedoMap => patchLayer(index, { albedoMap })} />
            <MapInput label={`${layer.name} normal`} value={layer.normalMap} onChange={normalMap => patchLayer(index, { normalMap })} />
            <MapInput label={`${layer.name} displacement`} value={layer.displacementMap ?? ''} onChange={displacementMap => patchLayer(index, { displacementMap })} />
            <NumberField name="displacementScale" label="Visual displacement (local units)" values={layer} onChange={patch => patchLayer(index, patch)} min={0} max={10} step={0.01} />
            <small style={{ color: colors.textMuted }}>Visual only, centered around mid-gray. Physics and picking use the terrain heightmap.</small>
            <MapInput label={`${layer.name} roughness`} value={layer.roughnessMap} onChange={roughnessMap => patchLayer(index, { roughnessMap })} />
        </details>)}
    </FieldGroup>;
}
