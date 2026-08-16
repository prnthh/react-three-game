import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { applyProps, extend } from '@react-three/fiber';
import type { ThreeElement } from '@react-three/fiber';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { FieldRenderer, Label, NumberInput } from './Input';
import type { FieldDefinition } from './Input';
import { useTextureAsset } from '../assetRuntime';
import { usePrefab } from '../SceneContext';
import { useEditorRef } from '../EditorContext';
import { usePrefabStore } from '../prefabStore';
import { createDefaultMaterial, DEFAULT_MATERIAL_ID } from '../prefab';
import { base, colors } from '../styles';
import type { MaterialComponentProperties, PrefabMaterial, PrefabMaterialType } from '../types';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
import { TexturePicker } from '../../assetviewer/page';
import { withBasePath } from '../runtimeUtils';
import {
    RepeatWrapping,
    ClampToEdgeWrapping,
    NoColorSpace,
    SRGBColorSpace,
    NearestFilter,
    LinearFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    LinearMipmapNearestFilter,
    LinearMipmapLinearFilter,
    FrontSide,
    BackSide,
    DoubleSide,
} from 'three';
import type {
    MinificationTextureFilter,
    MagnificationTextureFilter,
    Material,
    Texture,
} from 'three';

type TextureConfig = {
    colorSpace: Texture['colorSpace'];
    repeat?: boolean;
    repeatCount?: [number, number];
    offset?: [number, number];
    generateMipmaps: boolean;
    minFilter: MinificationTextureFilter;
    magFilter: MagnificationTextureFilter;
};

declare module '@react-three/fiber' {
    interface ThreeElements {
        meshBasicNodeMaterial: ThreeElement<typeof MeshBasicNodeMaterial>;
        meshStandardNodeMaterial: ThreeElement<typeof MeshStandardNodeMaterial>;
        spriteNodeMaterial: ThreeElement<typeof SpriteNodeMaterial>;
    }
}

export type MaterialProps = PrefabMaterial;

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

export type MaterialOverrides = Record<string, unknown>;

const EMPTY_MATERIAL_OVERRIDES: MaterialOverrides = Object.freeze({});
const MaterialOverridesContext = createContext<MaterialOverrides>(EMPTY_MATERIAL_OVERRIDES);
const SIDE_MAP = { FrontSide, BackSide, DoubleSide } as const;
const MIN_FILTER_MAP: Record<string, MinificationTextureFilter> = {
    NearestFilter,
    LinearFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    LinearMipmapNearestFilter,
    LinearMipmapLinearFilter,
};
const MAG_FILTER_MAP: Record<string, MagnificationTextureFilter> = {
    NearestFilter,
    LinearFilter,
};

function configureTexture(
    texture: Texture | null | undefined,
    options: TextureConfig,
) {
    if (!texture) return;

    if (options.repeat) {
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.repeat.set(options.repeatCount?.[0] ?? 1, options.repeatCount?.[1] ?? 1);
    } else {
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.repeat.set(1, 1);
    }

    texture.offset.set(options.offset?.[0] ?? 0, options.offset?.[1] ?? 0);
    texture.colorSpace = options.colorSpace;
    texture.generateMipmaps = options.generateMipmaps;
    texture.minFilter = options.minFilter;
    texture.magFilter = options.magFilter;
    texture.needsUpdate = true;
}

function useConfiguredTexture(texture: Texture | null | undefined, options: TextureConfig) {
    const {
        colorSpace,
        repeat,
        repeatCount,
        offset,
        generateMipmaps,
        minFilter,
        magFilter,
    } = options;
    const configuredTexture = useMemo(() => texture?.clone(), [texture]);

    useLayoutEffect(() => {
        configureTexture(configuredTexture, {
            colorSpace,
            repeat,
            repeatCount,
            offset,
            generateMipmaps,
            minFilter,
            magFilter,
        });
    }, [
        configuredTexture,
        colorSpace,
        repeat,
        repeatCount,
        offset,
        generateMipmaps,
        minFilter,
        magFilter,
    ]);

    useEffect(() => () => configuredTexture?.dispose(), [configuredTexture]);

    return configuredTexture;
}

export function useMaterialOverrides(): MaterialOverrides {
    return useContext(MaterialOverridesContext);
}

export function MaterialOverridesProvider({
    overrides,
    children,
}: {
    overrides: MaterialOverrides;
    children: ReactNode;
}) {
    const parent = useContext(MaterialOverridesContext);
    const merged = useMemo(() => ({ ...parent, ...overrides }), [parent, overrides]);
    return <MaterialOverridesContext.Provider value={merged}>{children}</MaterialOverridesContext.Provider>;
}

extend({
    MeshBasicNodeMaterial,
    MeshStandardNodeMaterial,
    SpriteNodeMaterial,
});

type SharedMaterial = MeshBasicNodeMaterial | MeshStandardNodeMaterial | SpriteNodeMaterial;

const SharedMaterialsContext = createContext<ReadonlyMap<string, SharedMaterial>>(new Map());

function createMaterial(type: PrefabMaterialType = 'standard'): SharedMaterial {
    if (type === 'basic') return new MeshBasicNodeMaterial();
    if (type === 'sprite') return new SpriteNodeMaterial();
    return new MeshStandardNodeMaterial();
}

function ConfiguredSharedMaterial({
    material,
    properties,
}: {
    material: SharedMaterial;
    properties: PrefabMaterial;
}) {
    const { basePath } = usePrefab();
    const textureName = properties.texture;
    const normalMapTextureName = properties.normalMapTexture;
    const texture = useTextureAsset(textureName ? withBasePath(basePath, textureName) : textureName) ?? undefined;
    const normalMapTexture = useTextureAsset(normalMapTextureName ? withBasePath(basePath, normalMapTextureName) : normalMapTextureName) ?? undefined;
    const textureConfig = {
        repeat: properties.repeat,
        repeatCount: properties.repeatCount,
        offset: properties.offset,
        generateMipmaps: properties.generateMipmaps !== false,
        minFilter: MIN_FILTER_MAP[properties.minFilter ?? 'LinearMipmapLinearFilter'] ?? LinearMipmapLinearFilter,
        magFilter: MAG_FILTER_MAP[properties.magFilter ?? 'LinearFilter'] ?? LinearFilter,
    };
    const map = useConfiguredTexture(texture, { ...textureConfig, colorSpace: SRGBColorSpace });
    const normalMap = useConfiguredTexture(normalMapTexture, { ...textureConfig, colorSpace: NoColorSpace });

    useLayoutEffect(() => {
        applyMaterialProperties(material, properties, map, normalMap, EMPTY_MATERIAL_OVERRIDES);
    }, [map, material, normalMap, properties]);

    return null;
}

export function MaterialRuntimeProvider({ children }: { children: ReactNode }) {
    const materials = usePrefabStore(state => state.materials);
    const materialTypes = Object.entries(materials)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, material]) => `${id}:${material.materialType ?? 'standard'}`)
        .join('|');
    const instances = useMemo(() => new Map(
        Object.entries(materials).map(([id, material]) => [id, createMaterial(material.materialType)]),
    ), [materialTypes]);

    useEffect(() => () => {
        instances.forEach(material => material.dispose());
    }, [instances]);

    return <SharedMaterialsContext.Provider value={instances}>
        {Object.entries(materials).map(([id, properties]) => (
            <ConfiguredSharedMaterial key={id} material={instances.get(id)!} properties={properties} />
        ))}
        {children}
    </SharedMaterialsContext.Provider>;
}

function applyMaterialProperties(
    material: SharedMaterial,
    properties: PrefabMaterial,
    map: Texture | null | undefined,
    normalMap: Texture | null | undefined,
    overrides: MaterialOverrides,
) {
    const materialType = properties.materialType ?? 'standard';
    const common = {
        name: properties.name ?? '',
        color: properties.color ?? '#ffffff',
        toneMapped: properties.toneMapped ?? true,
        transparent: properties.transparent ?? materialType === 'sprite',
        opacity: properties.opacity ?? 1,
        alphaTest: properties.alphaTest ?? 0,
        depthTest: properties.depthTest ?? materialType !== 'sprite',
        depthWrite: properties.depthWrite ?? materialType !== 'sprite',
        map: map ?? null,
    };

    applyProps(material, materialType === 'sprite' ? {
        ...common,
        rotation: properties.rotation ?? 0,
        sizeAttenuation: properties.sizeAttenuation ?? true,
        ...overrides,
    } : {
        ...common,
        wireframe: properties.wireframe ?? false,
        side: properties.side ? SIDE_MAP[properties.side] : FrontSide,
        ...(materialType === 'standard' ? {
            metalness: properties.metalness ?? 0,
            roughness: properties.roughness ?? 1,
            transmission: properties.transmission ?? 0,
            thickness: properties.thickness ?? 0,
            ior: properties.ior ?? 1.5,
            normalMap: normalMap ?? null,
            normalScale: normalMap ? properties.normalScale ?? [1, 1] : [1, 1],
        } : null),
        ...overrides,
    });
    material.needsUpdate = true;
}

function getNewMaterialId(materials: Record<string, PrefabMaterial>) {
    let id = 'material';
    let index = 2;
    while (materials[id]) id = `material-${index++}`;
    return id;
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
    const editor = useEditorRef();
    const { basePath } = editor;
    const materials = usePrefabStore(state => state.materials);
    const materialIds = Object.keys(materials);
    const materialId = properties.materialId && materials[properties.materialId]
        ? properties.materialId
        : materialIds[0] ?? DEFAULT_MATERIAL_ID;
    const material = materials[materialId] ?? createDefaultMaterial();
    const materialType = material.materialType ?? 'standard';
    const hasTexture = !!material.texture;
    const hasRepeat = material.repeat;
    const isStandardMaterial = materialType === 'standard';
    const isSpriteMaterial = materialType === 'sprite';
    const editorValues: PrefabMaterial = {
        name: material.name ?? '',
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
        const id = getNewMaterialId(materials);
        editor.setMaterial(id, { ...createDefaultMaterial(), name: id });
        update({ materialId: id });
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
            {materialIds.map(id => {
                const entry = materials[id];
                const selected = id === materialId;
                return (
                    <button
                        key={id}
                        type="button"
                        title={entry.name ? entry.name + ' (' + id + ')' : id}
                        aria-pressed={selected}
                        onClick={() => update({ materialId: id })}
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
                            {entry.name || id}
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
        <button
            type="button"
            style={{ ...base.header, marginTop: 4 }}
            onClick={() => setSettingsOpen(open => !open)}
            aria-expanded={settingsOpen}
        >
            <span>Material Settings</span>
            <span>{settingsOpen ? '▼' : '▶'}</span>
        </button>
        {settingsOpen && (
            <div style={{ paddingTop: 4 }}>
                <FieldRenderer
                    fields={fields}
                    values={editorValues}
                    onChange={patch => editor.setMaterial(materialId, {
                        ...material,
                        ...(patch.materialType === 'sprite' && materialType !== 'sprite' ? {
                            transparent: true,
                            depthTest: false,
                            depthWrite: false,
                        } : null),
                        ...patch,
                    })}
                />
            </div>
        )}
    </>;
}

function MaterialComponentView({ properties, children }: ComponentViewProps<MaterialComponentProperties>) {
    const materialId = properties.materialId ?? DEFAULT_MATERIAL_ID;
    const material = usePrefabStore(state => state.materials[materialId] ?? state.materials[DEFAULT_MATERIAL_ID]);
    const sharedMaterials = useContext(SharedMaterialsContext);
    const sharedMaterial = sharedMaterials.get(materialId) ?? sharedMaterials.get(DEFAULT_MATERIAL_ID);
    const materialType = material.materialType ?? 'standard';
    const overrides = useMaterialOverrides();
    const ownsMaterial = Object.keys(overrides).length > 0;
    const localMaterial = useMemo(
        () => ownsMaterial ? createMaterial(materialType) : null,
        [materialType, ownsMaterial],
    );
    const resolvedMaterial = localMaterial ?? sharedMaterial;

    useEffect(() => () => localMaterial?.dispose(), [localMaterial]);
    useLayoutEffect(() => {
        if (!localMaterial || !sharedMaterial) return;
        localMaterial.copy(sharedMaterial);
        applyProps(localMaterial, overrides);
        localMaterial.needsUpdate = true;
    }, [localMaterial, material, overrides, sharedMaterial]);

    return <>
        {resolvedMaterial ? (
            <primitive object={resolvedMaterial as Material} attach={properties.attach ?? 'material'} dispose={null} />
        ) : null}
        {children}
    </>;
}

const MaterialComponent: Component<MaterialComponentProperties> = {
    name: 'Material',
    attachment: true,
    Editor: MaterialComponentEditor,
    View: MaterialComponentView,
    defaultProperties: {
        attach: 'material',
        materialId: DEFAULT_MATERIAL_ID,
    },
};

export default MaterialComponent;
