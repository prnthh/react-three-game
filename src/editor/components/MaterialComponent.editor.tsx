import { useState } from 'react';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { FieldRenderer, Label, NumberInput } from '../ui/Input.js';
import type { FieldDefinition } from '../ui/Input.js';
import { useEditorRef } from '../EditorContext.js';
import { usePrefabStore } from "../../runtime/prefabs/PrefabStoreContext.js";
import { getMaterialDefinition, MATERIAL_FIELDS } from '../../core/prefab.js';
import { base, colors } from '../ui/styles.js';
import type { MaterialComponentProperties, PrefabMaterial } from '../../core/types.js';
import { TexturePicker } from '../assets/AssetBrowser.js';
import { withBasePath } from "../../runtime/assets/assetPaths.js";

function Vector2Editor({
    label,
    value,
    onChange,
    min,
    max,
    step,
}: {
    label: string;
    value: [number, number] | undefined;
    onChange: (value: [number, number]) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <div style={{ display: 'flex', gap: 2 }}>
            <div style={{ flex: 1 }}>
                <Label>{label} X</Label>
                <NumberInput
                    value={value?.[0] ?? 0}
                    onChange={x => onChange([x, value?.[1] ?? 0])}
                    min={min}
                    max={max}
                    step={step}
                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                />
            </div>
            <div style={{ flex: 1 }}>
                <Label>{label} Y</Label>
                <NumberInput
                    value={value?.[1] ?? 0}
                    onChange={y => onChange([value?.[0] ?? 0, y])}
                    min={min}
                    max={max}
                    step={step}
                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                />
            </div>
        </div>
    );
}

function MaterialPreview({ material, basePath }: { material: PrefabMaterial; basePath: string }) {
    const materialType = material.materialType ?? 'standard';
    const texturePath = material.texture ? withBasePath(basePath, material.texture) : null;
    const opacity = material.transparent ? material.opacity ?? 1 : 1;

    return (
        <div style={{
            width: '100%',
            aspectRatio: '1.35 / 1',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            backgroundColor: '#c8c8c8',
            backgroundImage: 'linear-gradient(45deg, #b4b4b4 25%, transparent 25%), linear-gradient(-45deg, #b4b4b4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #b4b4b4 75%), linear-gradient(-45deg, transparent 75%, #b4b4b4 75%)',
            backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0',
            backgroundSize: '10px 10px',
            border: '1px solid ' + colors.borderFaint,
            boxSizing: 'border-box',
        }}>
            <div style={{
                position: 'relative',
                width: materialType === 'sprite' ? '48%' : '58%',
                aspectRatio: '1 / 1',
                overflow: 'hidden',
                borderRadius: materialType === 'sprite' ? 2 : '50%',
                backgroundColor: material.color ?? '#ffffff',
                backgroundImage: texturePath ? 'url(' + JSON.stringify(texturePath) + ')' : undefined,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
                backgroundBlendMode: 'multiply',
                boxShadow: materialType === 'standard'
                    ? 'inset -8px -9px 12px rgba(0,0,0,0.38), inset 2px 2px 3px rgba(255,255,255,0.24)'
                    : 'inset 0 0 0 1px rgba(0,0,0,0.18)',
                opacity,
            }}>
                {materialType === 'standard' && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle at 33% 27%, rgba(255,255,255,0.95), rgba(255,255,255,0.28) 16%, transparent 48%)',
                        opacity: Math.max(0.15, 1 - (material.roughness ?? 1) * 0.75),
                    }} />
                )}
            </div>
        </div>
    );
}

function MaterialComponentEditor({
    properties,
    update,
}: ComponentEditorProps<MaterialComponentProperties>) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [materialError, setMaterialError] = useState('');
    const editor = useEditorRef();
    const { basePath } = editor;
    const materials = usePrefabStore(state => state.materials);
    const materialName = properties.name ?? '';
    const definition = getMaterialDefinition(properties);
    const material = materials[materialName] ?? definition ?? {};
    const canEditMaterial = !!materials[materialName] || !!definition || !materialName;
    const replaceMaterial = (patch: Partial<MaterialComponentProperties>) => editor.batch(() => {
        update({ ...Object.fromEntries(MATERIAL_FIELDS.map(key => [key, undefined])), ...patch });
        // Keep the old shared definition available after its owning mesh switches away.
        if (materialName && definition && !editor.getMaterial(materialName)) {
            editor.setMaterial(materialName, definition);
        }
    });
    const materialType = material.materialType ?? 'standard';
    const hasTexture = !!material.texture;
    const hasRepeat = material.repeat;
    const isStandardMaterial = materialType === 'standard';
    const isSpriteMaterial = materialType === 'sprite';
    const editorValues: PrefabMaterial = {
        name: materialName,
        materialType,
        color: material.color ?? '#ffffff',
        toneMapped: material.toneMapped ?? true,
        wireframe: material.wireframe ?? false,
        transparent: material.transparent ?? isSpriteMaterial,
        opacity: material.opacity ?? 1,
        depthTest: material.depthTest ?? !isSpriteMaterial,
        depthWrite: material.depthWrite ?? !isSpriteMaterial,
        metalness: material.metalness ?? 0,
        roughness: material.roughness ?? 1,
        transmission: material.transmission ?? 0,
        thickness: material.thickness ?? 0,
        ior: material.ior ?? 1.5,
        rotation: material.rotation ?? 0,
        sizeAttenuation: material.sizeAttenuation ?? true,
        side: material.side ?? 'FrontSide',
        offset: material.offset ?? [0, 0],
        ...material,
        generateMipmaps: material.generateMipmaps ?? true,
        minFilter: material.minFilter ?? 'LinearMipmapLinearFilter',
        magFilter: material.magFilter ?? 'LinearFilter',
    };

    const fields: FieldDefinition<PrefabMaterial>[] = [
        { name: 'name', type: 'string', label: 'Name' },
        {
            name: 'materialType',
            type: 'select',
            label: 'Material Type',
            options: [
                { value: 'standard', label: 'Standard' },
                { value: 'basic', label: 'Basic' },
                { value: 'sprite', label: 'Sprite' },
            ],
        },
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'toneMapped', type: 'boolean', label: 'Tone Mapped' },
    ];

    if (!isSpriteMaterial) {
        fields.push({ name: 'wireframe', type: 'boolean', label: 'Wireframe' });
    }

    fields.push(
        { name: 'transparent', type: 'boolean', label: 'Transparent' },
        { name: 'opacity', type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.01 },
    );

    if (isSpriteMaterial) {
        fields.push(
            { name: 'rotation', type: 'number', label: 'Rotation', step: 0.01 },
            { name: 'sizeAttenuation', type: 'boolean', label: 'Size Attenuation' },
            { name: 'depthTest', type: 'boolean', label: 'Depth Test' },
            { name: 'depthWrite', type: 'boolean', label: 'Depth Write' },
        );
    }

    if (isStandardMaterial) {
        fields.push(
            { name: 'metalness', type: 'number', label: 'Metalness', min: 0, max: 1, step: 0.01 },
            { name: 'roughness', type: 'number', label: 'Roughness', min: 0, max: 1, step: 0.01 },
            { name: 'transmission', type: 'number', label: 'Transmission', min: 0, max: 1, step: 0.01 },
            { name: 'thickness', type: 'number', label: 'Thickness', min: 0, step: 0.1 },
            { name: 'ior', type: 'number', label: 'IOR (Index of Refraction)', min: 1, max: 2.333, step: 0.01 },
        );
    }

    if (!isSpriteMaterial) {
        fields.push({
            name: 'side',
            type: 'select',
            label: 'Side',
            options: [
                { value: 'FrontSide', label: 'Front' },
                { value: 'BackSide', label: 'Back' },
                { value: 'DoubleSide', label: 'Double' },
            ],
        });
    }

    fields.push({
        name: 'texture',
        type: 'custom',
        label: 'Texture File',
        render: ({ value, onChange }) => (
            <TexturePicker value={value} onChange={onChange} basePath={basePath} />
        ),
    });

    if (hasTexture) {
        fields.push({ name: 'repeat', type: 'boolean', label: 'Repeat Texture' });

        if (hasRepeat) {
            fields.push({
                name: 'repeatCount',
                type: 'custom',
                label: 'Repeat (X, Y)',
                render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                    <Vector2Editor label="Repeat" value={value} onChange={onChange} min={0.01} max={100} step={0.1} />
                ),
            });
        }

        fields.push({
            name: 'offset',
            type: 'custom',
            label: 'Offset (X, Y)',
            render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                <Vector2Editor label="Offset" value={value} onChange={onChange} step={0.01} />
            ),
        });

        if (!isSpriteMaterial) {
            fields.push({
                name: 'normalMapTexture',
                type: 'custom',
                label: 'Normal Map',
                render: ({ value, onChange }) => (
                    <TexturePicker value={value} onChange={onChange} basePath={basePath} />
                ),
            });
        }

        if (!isSpriteMaterial && material.normalMapTexture) {
            fields.push({
                name: 'normalScale',
                type: 'custom',
                label: 'Normal Scale (X, Y)',
                render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                    <Vector2Editor label="Normal" value={value} onChange={onChange} min={0} max={5} step={0.01} />
                ),
            });
        }

        fields.push(
            { name: 'generateMipmaps', type: 'boolean', label: 'Generate Mipmaps' },
            {
                name: 'minFilter',
                type: 'select',
                label: 'Min Filter',
                options: [
                    { value: 'LinearMipmapLinearFilter', label: 'Linear Mipmap Linear (Default)' },
                    { value: 'LinearFilter', label: 'Linear' },
                    { value: 'LinearMipmapNearestFilter', label: 'Linear Mipmap Nearest' },
                    { value: 'NearestFilter', label: 'Nearest' },
                    { value: 'NearestMipmapNearestFilter', label: 'Nearest Mipmap Nearest' },
                    { value: 'NearestMipmapLinearFilter', label: 'Nearest Mipmap Linear' },
                ],
            },
            {
                name: 'magFilter',
                type: 'select',
                label: 'Mag Filter',
                options: [
                    { value: 'LinearFilter', label: 'Linear (Default)' },
                    { value: 'NearestFilter', label: 'Nearest' },
                ],
            },
        );
    }

    const createMaterialEntry = () => {
        replaceMaterial({ name: crypto.randomUUID(), materialType: 'standard' });
    };

    return <>
        <div style={base.label}>Material</div>
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 4,
            maxHeight: 220,
            overflowY: 'auto',
            paddingRight: 2,
            marginBottom: 6,
            scrollbarWidth: 'thin',
            scrollbarColor: colors.borderFaint + ' transparent',
        }}>
            {Object.entries(materials).map(([id, entry]) => {
                const selected = id === materialName;
                const label = entry.name || id;
                return (
                    <button
                        key={id}
                        type="button"
                        title={label}
                        aria-pressed={selected}
                        onClick={() => { if (!selected) replaceMaterial({ name: id }); }}
                        style={{
                            ...base.btn,
                            minWidth: 0,
                            height: 'auto',
                            padding: 3,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            background: selected ? colors.accentBg : colors.bgLight,
                            borderColor: selected ? colors.accent : colors.border,
                        }}
                    >
                        <MaterialPreview material={entry} basePath={basePath} />
                        <span style={{
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                        }}>
                            {label}
                        </span>
                    </button>
                );
            })}
            <button
                type="button"
                title="New Material"
                onClick={createMaterialEntry}
                style={{
                    ...base.btn,
                    minWidth: 0,
                    minHeight: 70,
                    padding: 3,
                    display: 'grid',
                    placeItems: 'center',
                    background: colors.bgLight,
                    fontSize: 20,
                }}
            >
                +
            </button>
        </div>
        <FieldRenderer
            fields={[{ name: 'attach', type: 'string', label: 'Attach' }]}
            values={properties}
            onChange={update}
        />
        {canEditMaterial && <button
            type="button"
            style={{ ...base.header, borderRadius: base.btn.borderRadius, marginTop: 4 }}
            onClick={() => setSettingsOpen(open => !open)}
            aria-expanded={settingsOpen}
        >
            <span>Material Settings</span>
            <span>{settingsOpen ? '▼' : '▶'}</span>
        </button>}
        {materialError && <div role="alert" style={{ color: colors.danger }}>{materialError}</div>}
        {canEditMaterial && settingsOpen && (
            <div style={{ paddingTop: 4 }}>
                <FieldRenderer
                    fields={fields}
                    values={editorValues}
                    onChange={patch => {
                        const next = {
                            ...material,
                            ...(patch.materialType === 'sprite' && materialType !== 'sprite' ? {
                                transparent: true,
                                depthTest: false,
                                depthWrite: false,
                            } : null),
                            ...patch,
                        };
                        try {
                            if (materialName && materials[materialName]) editor.setMaterial(materialName, next);
                            else update(next);
                            setMaterialError('');
                        } catch (error) {
                            setMaterialError(error instanceof Error ? error.message : 'Could not update material.');
                        }
                    }}
                />
            </div>
        )}
    </>;
}

export default MaterialComponentEditor;
