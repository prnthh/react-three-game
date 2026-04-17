import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { extend } from '@react-three/fiber';
import type { ThreeElement } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { Component } from './ComponentRegistry';
import { FieldRenderer, FieldDefinition, Label, NumberInput } from './Input';
import { useAssetRuntime } from '../runtime';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { TexturePicker } from '../../assetviewer/page';
import {
    RepeatWrapping,
    ClampToEdgeWrapping,
    SRGBColorSpace,
    LinearSRGBColorSpace,
    Texture,
    NearestFilter,
    LinearFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    LinearMipmapNearestFilter,
    LinearMipmapLinearFilter,
    MinificationTextureFilter,
    MagnificationTextureFilter,
    MeshBasicMaterialProperties,
    MeshStandardMaterialProperties,
    FrontSide,
    BackSide,
    DoubleSide,
} from 'three';

declare module '@react-three/fiber' {
    interface ThreeElements {
        meshBasicNodeMaterial: ThreeElement<typeof MeshBasicNodeMaterial>;
        meshStandardNodeMaterial: ThreeElement<typeof MeshStandardNodeMaterial>;
    }
}

export interface MaterialProps extends Omit<MeshStandardMaterialProperties & MeshBasicMaterialProperties, 'args' | 'normalScale'> {
    materialType?: 'standard' | 'basic';
    transmission?: number;
    thickness?: number;
    ior?: number;
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
});

function MaterialComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const materialType = component.properties.materialType ?? 'standard';
    const hasTexture = !!component.properties.texture;
    const hasRepeat = component.properties.repeat;
    const animateOffset = component.properties.animateOffset;
    const isStandardMaterial = materialType === 'standard';

    const fields: FieldDefinition[] = [
        {
            name: 'materialType',
            type: 'select',
            label: 'Material Type',
            options: [
                { value: 'standard', label: 'Standard' },
                { value: 'basic', label: 'Basic' },
            ],
        },
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'toneMapped', type: 'boolean', label: 'Tone Mapped' },
        { name: 'wireframe', type: 'boolean', label: 'Wireframe' },
        { name: 'transparent', type: 'boolean', label: 'Transparent' },
        { name: 'opacity', type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.01 },
        ...(isStandardMaterial ? [
            { name: 'metalness', type: 'number', label: 'Metalness', min: 0, max: 1, step: 0.01 },
            { name: 'roughness', type: 'number', label: 'Roughness', min: 0, max: 1, step: 0.01 },
            { name: 'transmission', type: 'number', label: 'Transmission', min: 0, max: 1, step: 0.01 },
            { name: 'thickness', type: 'number', label: 'Thickness', min: 0, step: 0.1 },
            { name: 'ior', type: 'number', label: 'IOR (Index of Refraction)', min: 1, max: 2.333, step: 0.01 },
        ] as FieldDefinition[] : []),
        {
            name: 'side',
            type: 'select',
            label: 'Side',
            options: [
                { value: 'FrontSide', label: 'Front' },
                { value: 'BackSide', label: 'Back' },
                { value: 'DoubleSide', label: 'Double' },
            ],
        } as FieldDefinition,
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
            {
                name: 'normalMapTexture',
                type: 'custom',
                label: 'Normal Map',
                render: ({ value, onChange }) => (
                    <TexturePicker value={value} onChange={onChange} basePath={basePath} />
                ),
            } as FieldDefinition,
            ...(component.properties.normalMapTexture ? [{
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
function MaterialComponentView({ properties: rawProps }: { properties: Record<string, any> }) {
    const { getTexture } = useAssetRuntime();
    const properties = rawProps as MaterialProps;
    const materialType = properties?.materialType ?? 'standard';
    const textureName = properties?.texture;
    const offset = properties?.offset;
    const repeat = properties?.repeat;
    const repeatCount = properties?.repeatCount;
    const animateOffset = properties?.animateOffset;
    const offsetSpeed = properties?.offsetSpeed;
    const generateMipmaps = properties?.generateMipmaps !== false;
    const minFilter = properties?.minFilter || 'LinearMipmapLinearFilter';
    const magFilter = properties?.magFilter || 'LinearFilter';
    const texture = textureName ? getTexture(textureName) ?? undefined : undefined;

    const normalMapTextureName = properties?.normalMapTexture;
    const normalScaleProp = properties?.normalScale;
    const normalMapTexture = normalMapTextureName ? getTexture(normalMapTextureName) ?? undefined : undefined;
    const materialSource: MaterialProps = properties ?? {};

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
        side: sideProp,
        ...materialProps
    } = materialSource;

    const sideMap: Record<string, any> = { FrontSide, BackSide, DoubleSide };
    const resolvedSide = sideProp ? (sideMap[sideProp as unknown as string] ?? FrontSide) : FrontSide;

    const minFilterMap: Record<string, MinificationTextureFilter> = {
        NearestFilter,
        LinearFilter,
        NearestMipmapNearestFilter,
        NearestMipmapLinearFilter,
        LinearMipmapNearestFilter,
        LinearMipmapLinearFilter
    };

    const magFilterMap: Record<string, MagnificationTextureFilter> = {
        NearestFilter,
        LinearFilter
    };

    const animatedOffsetRef = useRef<[number, number]>([offset?.[0] ?? 0, offset?.[1] ?? 0]);

    const finalTexture = useMemo(() => {
        if (!texture) return undefined;
        const t = texture.clone();
        if (repeat) {
            t.wrapS = t.wrapT = RepeatWrapping;
            if (repeatCount) t.repeat.set(repeatCount[0], repeatCount[1]);
        } else {
            t.wrapS = t.wrapT = ClampToEdgeWrapping;
            t.repeat.set(1, 1);
        }
        t.offset.set(offset?.[0] ?? 0, offset?.[1] ?? 0);
        t.colorSpace = SRGBColorSpace;
        t.generateMipmaps = generateMipmaps;
        t.minFilter = minFilterMap[minFilter] ?? LinearMipmapLinearFilter;
        t.magFilter = magFilterMap[magFilter] ?? LinearFilter;
        t.needsUpdate = true;
        return t;
    }, [texture, repeat, repeatCount?.[0], repeatCount?.[1], offset?.[0], offset?.[1], generateMipmaps, minFilter, magFilter]);

    animatedOffsetRef.current = [offset?.[0] ?? 0, offset?.[1] ?? 0];

    useFrame((_, delta) => {
        if (!finalTexture || !animateOffset) return;

        const nextX = animatedOffsetRef.current[0] + (offsetSpeed?.[0] ?? 0) * delta;
        const nextY = animatedOffsetRef.current[1] + (offsetSpeed?.[1] ?? 0) * delta;

        animatedOffsetRef.current = [nextX, nextY];
        finalTexture.offset.set(nextX, nextY);
    });

    const finalNormalMap = useMemo(() => {
        if (!normalMapTexture) return undefined;
        const t = normalMapTexture.clone();
        t.colorSpace = LinearSRGBColorSpace;
        t.needsUpdate = true;
        return t;
    }, [normalMapTexture]);

    if (!properties) {
        return <meshStandardNodeMaterial color="red" wireframe />;
    }

    const overrides = useMaterialOverrides();
    const sharedProps = {
        map: finalTexture,
        side: resolvedSide,
        ...materialProps,
        ...overrides,
    };

    if (materialType === 'basic') {
        return <meshBasicNodeMaterial {...sharedProps} />;
    }

    return (
        <meshStandardNodeMaterial
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
        offset: [0, 0],
        animateOffset: false,
        offsetSpeed: [0, 0],
        metalness: 0,
        roughness: 1
    },
    getAssetRefs: (properties) => {
        const refs: { type: 'texture'; path: string }[] = [];
        if (properties.texture) refs.push({ type: 'texture', path: properties.texture });
        if (properties.normalMapTexture) refs.push({ type: 'texture', path: properties.normalMapTexture });
        return refs;
    },
};

export default MaterialComponent;