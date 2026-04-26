import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { extend } from '@react-three/fiber';
import type { ThreeElement } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { assetRef, assetRefs } from './ComponentRegistry';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import { FieldRenderer, Label, NumberInput } from './Input';
import type { FieldDefinition } from './Input';
import { useAssetRuntime } from '../assetRuntime';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
import { TexturePicker } from '../../assetviewer/page';
import type { ComponentData } from '../types';
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
    MeshBasicMaterialProperties,
    MeshStandardMaterialProperties,
    Texture,
} from 'three';

declare module '@react-three/fiber' {
    interface ThreeElements {
        meshBasicNodeMaterial: ThreeElement<typeof MeshBasicNodeMaterial>;
        meshStandardNodeMaterial: ThreeElement<typeof MeshStandardNodeMaterial>;
        spriteNodeMaterial: ThreeElement<typeof SpriteNodeMaterial>;
    }
}

export interface MaterialProps extends Omit<MeshStandardMaterialProperties & MeshBasicMaterialProperties, 'args' | 'normalScale' | 'side'> {
    materialType?: 'standard' | 'basic' | 'sprite';
    transmission?: number;
    thickness?: number;
    ior?: number;
    rotation?: number;
    sizeAttenuation?: boolean;
    texture?: string;
    offset?: [number, number];
    repeat?: boolean;
    repeatCount?: [number, number];
    animateOffset?: boolean;
    offsetSpeed?: [number, number];
    generateMipmaps?: boolean;
    minFilter?: string;
    magFilter?: string;
    normalMapTexture?: string;
    normalScale?: [number, number];
    side?: keyof typeof SIDE_MAP;
}

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

function cloneConfiguredTexture({
    texture,
    repeat,
    repeatCount,
    offset,
    colorSpace,
    generateMipmaps,
    minFilter,
    magFilter,
}: {
    texture: Texture;
    repeat?: boolean;
    repeatCount?: [number, number];
    offset?: [number, number];
    colorSpace: typeof NoColorSpace | typeof SRGBColorSpace;
    generateMipmaps: boolean;
    minFilter: MinificationTextureFilter;
    magFilter: MagnificationTextureFilter;
}) {
    const clonedTexture = texture.clone();

    if (repeat) {
        clonedTexture.wrapS = clonedTexture.wrapT = RepeatWrapping;
        if (repeatCount) clonedTexture.repeat.set(repeatCount[0], repeatCount[1]);
    } else {
        clonedTexture.wrapS = clonedTexture.wrapT = ClampToEdgeWrapping;
        clonedTexture.repeat.set(1, 1);
    }

    clonedTexture.offset.set(offset?.[0] ?? 0, offset?.[1] ?? 0);
    clonedTexture.colorSpace = colorSpace;
    clonedTexture.generateMipmaps = generateMipmaps;
    clonedTexture.minFilter = minFilter;
    clonedTexture.magFilter = magFilter;
    clonedTexture.needsUpdate = true;

    return clonedTexture;
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

function MaterialComponentEditor({
    component,
    onUpdate,
    basePath = "",
}: {
    component: ComponentData;
    onUpdate: (newProps: Record<string, unknown>) => void;
    basePath?: string;
}) {
    const materialType = component.properties.materialType ?? 'standard';
    const hasTexture = !!component.properties.texture;
    const hasRepeat = component.properties.repeat;
    const animateOffset = component.properties.animateOffset;
    const isStandardMaterial = materialType === 'standard';
    const isSpriteMaterial = materialType === 'sprite';

    const fields: FieldDefinition[] = [
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
        ...(!isSpriteMaterial ? [
            { name: 'wireframe', type: 'boolean', label: 'Wireframe' } as FieldDefinition,
        ] : []),
        { name: 'transparent', type: 'boolean', label: 'Transparent' },
        { name: 'opacity', type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.01 },
        ...(isSpriteMaterial ? [
            { name: 'rotation', type: 'number', label: 'Rotation', step: 0.01 } as FieldDefinition,
            { name: 'sizeAttenuation', type: 'boolean', label: 'Size Attenuation' } as FieldDefinition,
            { name: 'depthTest', type: 'boolean', label: 'Depth Test' } as FieldDefinition,
            { name: 'depthWrite', type: 'boolean', label: 'Depth Write' } as FieldDefinition,
        ] : []),
        ...(isStandardMaterial ? [
            { name: 'metalness', type: 'number', label: 'Metalness', min: 0, max: 1, step: 0.01 },
            { name: 'roughness', type: 'number', label: 'Roughness', min: 0, max: 1, step: 0.01 },
            { name: 'transmission', type: 'number', label: 'Transmission', min: 0, max: 1, step: 0.01 },
            { name: 'thickness', type: 'number', label: 'Thickness', min: 0, step: 0.1 },
            { name: 'ior', type: 'number', label: 'IOR (Index of Refraction)', min: 1, max: 2.333, step: 0.01 },
        ] as FieldDefinition[] : []),
        ...(!isSpriteMaterial ? [{
            name: 'side',
            type: 'select',
            label: 'Side',
            options: [
                { value: 'FrontSide', label: 'Front' },
                { value: 'BackSide', label: 'Back' },
                { value: 'DoubleSide', label: 'Double' },
            ],
        } as FieldDefinition] : []),
        {
            name: 'texture',
            type: 'custom',
            label: 'Texture File',
            render: ({ value, onChange }) => (
                <TexturePicker value={value} onChange={onChange} basePath={basePath} />
            ),
        },
        // Conditional texture settings
        ...(hasTexture ? [
            { name: 'repeat', type: 'boolean', label: 'Repeat Texture' } as FieldDefinition,
            ...(hasRepeat ? [{
                name: 'repeatCount',
                type: 'custom',
                label: 'Repeat (X, Y)',
                render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                    <Vector2Editor label="Repeat" value={value} onChange={onChange} min={0.01} max={100} step={0.1} />
                ),
            } as FieldDefinition] : []),
            {
                name: 'offset',
                type: 'custom',
                label: 'Offset (X, Y)',
                render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                    <Vector2Editor label="Offset" value={value} onChange={onChange} step={0.01} />
                ),
            } as FieldDefinition,
            { name: 'animateOffset', type: 'boolean', label: 'Animate Offset' } as FieldDefinition,
            ...(animateOffset ? [{
                name: 'offsetSpeed',
                type: 'custom',
                label: 'Speed (X, Y)',
                render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                    <Vector2Editor label="Speed" value={value} onChange={onChange} step={0.01} />
                ),
            } as FieldDefinition] : []),
            ...(!isSpriteMaterial ? [{
                name: 'normalMapTexture',
                type: 'custom',
                label: 'Normal Map',
                render: ({ value, onChange }) => (
                    <TexturePicker value={value} onChange={onChange} basePath={basePath} />
                ),
            } as FieldDefinition] : []),
            ...(!isSpriteMaterial && component.properties.normalMapTexture ? [{
                name: 'normalScale',
                type: 'custom',
                label: 'Normal Scale (X, Y)',
                render: ({ value, onChange }: { value: [number, number] | undefined; onChange: (v: [number, number]) => void }) => (
                    <Vector2Editor label="Normal" value={value} onChange={onChange} min={0} max={5} step={0.01} />
                ),
            } as FieldDefinition] : []),
            { name: 'generateMipmaps', type: 'boolean', label: 'Generate Mipmaps' } as FieldDefinition,
            {
                name: 'minFilter',
                type: 'select',
                label: 'Min Filter',
                options: [
                    { value: 'NearestFilter', label: 'Nearest' },
                    { value: 'NearestMipmapNearestFilter', label: 'Nearest Mipmap Nearest' },
                    { value: 'NearestMipmapLinearFilter', label: 'Nearest Mipmap Linear' },
                    { value: 'LinearFilter', label: 'Linear' },
                    { value: 'LinearMipmapNearestFilter', label: 'Linear Mipmap Nearest' },
                    { value: 'LinearMipmapLinearFilter', label: 'Linear Mipmap Linear (Default)' },
                ],
            } as FieldDefinition,
            {
                name: 'magFilter',
                type: 'select',
                label: 'Mag Filter',
                options: [
                    { value: 'NearestFilter', label: 'Nearest' },
                    { value: 'LinearFilter', label: 'Linear (Default)' },
                ],
            } as FieldDefinition,
        ] : []),
    ];

    return (
        <FieldRenderer
            fields={fields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

// View for Material component
function MaterialComponentView({ properties: rawProps }: ComponentViewProps<Record<string, unknown>>) {
    const { getTexture } = useAssetRuntime();
    const properties = rawProps as unknown as MaterialProps | undefined;
    const materialSource = properties ?? {} as MaterialProps;

    const materialType = materialSource.materialType ?? 'standard';
    const textureName = materialSource.texture;
    const normalMapTextureName = materialSource.normalMapTexture;
    const offset = materialSource.offset;
    const repeat = materialSource.repeat;
    const repeatCount = materialSource.repeatCount;
    const animateOffset = materialSource.animateOffset;
    const offsetSpeed = materialSource.offsetSpeed;
    const generateMipmaps = materialSource.generateMipmaps !== false;
    const minFilter = materialSource.minFilter ?? 'LinearMipmapLinearFilter';
    const magFilter = materialSource.magFilter ?? 'LinearFilter';
    const texture = textureName ? getTexture(textureName) : undefined;
    const normalScaleProp = materialSource.normalScale;
    const normalMapTexture = normalMapTextureName ? getTexture(normalMapTextureName) : undefined;

    // Destructure all material props and separate custom texture handling props
    const {
        texture: _texture,
        offset: _offset,
        repeat: _repeat,
        repeatCount: _repeatCount,
        animateOffset: _animateOffset,
        offsetSpeed: _offsetSpeed,
        generateMipmaps: _generateMipmaps,
        minFilter: _minFilter,
        magFilter: _magFilter,
        map: _map,
        materialType: _materialType,
        normalMapTexture: _normalMapTexture,
        normalScale: _normalScale,
        normalMap: _normalMap,
        rotation,
        sizeAttenuation,
        side: sideProp,
        ...materialProps
    } = materialSource;

    const resolvedSide = sideProp ? SIDE_MAP[sideProp] ?? FrontSide : FrontSide;
    const resolvedMinFilter = MIN_FILTER_MAP[minFilter] ?? LinearMipmapLinearFilter;
    const resolvedMagFilter = MAG_FILTER_MAP[magFilter] ?? LinearFilter;
    const animatedOffsetRef = useRef<[number, number]>([offset?.[0] ?? 0, offset?.[1] ?? 0]);

    const finalTexture = useMemo(() => {
        if (!texture) return undefined;

        return cloneConfiguredTexture({
            texture,
            repeat,
            repeatCount,
            offset,
            colorSpace: SRGBColorSpace,
            generateMipmaps,
            minFilter: resolvedMinFilter,
            magFilter: resolvedMagFilter,
        });
    }, [texture, repeat, repeatCount?.[0], repeatCount?.[1], offset?.[0], offset?.[1], generateMipmaps, resolvedMinFilter, resolvedMagFilter]);

    const finalNormalMap = useMemo(() => {
        if (!normalMapTexture) return undefined;

        return cloneConfiguredTexture({
            texture: normalMapTexture,
            repeat,
            repeatCount,
            offset,
            colorSpace: NoColorSpace,
            generateMipmaps,
            minFilter: resolvedMinFilter,
            magFilter: resolvedMagFilter,
        });
    }, [normalMapTexture, repeat, repeatCount?.[0], repeatCount?.[1], offset?.[0], offset?.[1], generateMipmaps, resolvedMinFilter, resolvedMagFilter]);

    animatedOffsetRef.current = [offset?.[0] ?? 0, offset?.[1] ?? 0];

    useFrame((_, delta) => {
        if ((!finalTexture && !finalNormalMap) || !animateOffset) return;

        const nextX = animatedOffsetRef.current[0] + (offsetSpeed?.[0] ?? 0) * delta;
        const nextY = animatedOffsetRef.current[1] + (offsetSpeed?.[1] ?? 0) * delta;

        animatedOffsetRef.current = [nextX, nextY];
        finalTexture?.offset.set(nextX, nextY);
        finalNormalMap?.offset.set(nextX, nextY);
    });

    const overrides = useMaterialOverrides();

    if (!properties) {
        return <meshStandardNodeMaterial attach="material" color="red" wireframe />;
    }

    const materialKey = [
        materialType,
        textureName ?? 'none',
        texture?.uuid ?? 'texture-pending',
        normalMapTextureName ?? 'none',
        normalMapTexture?.uuid ?? 'normal-pending',
    ].join(':');

    const sharedProps = {
        map: finalTexture,
        side: resolvedSide,
        ...materialProps,
        ...overrides,
    };

    if (materialType === 'basic') {
        return <meshBasicNodeMaterial key={materialKey} attach="material" {...sharedProps} />;
    }

    if (materialType === 'sprite') {
        const spriteTransparent = materialSource.transparent !== false;

        return (
            <spriteNodeMaterial
                key={materialKey}
                attach="material"
                map={finalTexture}
                color={materialSource.color ?? '#ffffff'}
                opacity={materialSource.opacity ?? 1}
                transparent={spriteTransparent}
                alphaTest={materialSource.alphaTest ?? 0}
                depthTest={materialSource.depthTest ?? false}
                depthWrite={materialSource.depthWrite ?? false}
                toneMapped={materialSource.toneMapped ?? true}
                {...overrides}
                rotation={rotation ?? 0}
                sizeAttenuation={sizeAttenuation ?? true}
            />
        );
    }

    return (
        <meshStandardNodeMaterial
            key={materialKey}
            attach="material"
            {...sharedProps}
            normalMap={finalNormalMap}
            normalScale={finalNormalMap ? [normalScaleProp?.[0] ?? 1, normalScaleProp?.[1] ?? 1] : undefined}
        />
    );
}

const MaterialComponent: Component = {
    name: 'Material',
    Editor: MaterialComponentEditor,
    View: MaterialComponentView,
    defaultProperties: {
        materialType: 'standard',
        color: '#ffffff',
        toneMapped: true,
        wireframe: false,
        transparent: false,
        opacity: 1,
        sizeAttenuation: true,
        offset: [0, 0],
        animateOffset: false,
        offsetSpeed: [0, 0],
        metalness: 0,
        roughness: 1
    },
    getAssetRefs: (properties) => assetRefs(
        assetRef('texture', properties.texture),
        assetRef('texture', properties.normalMapTexture),
    ),
};

export default MaterialComponent;