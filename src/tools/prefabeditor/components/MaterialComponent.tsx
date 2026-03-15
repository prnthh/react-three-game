import { SingleTextureViewer, TextureListViewer } from '../../assetviewer/page';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Component } from './ComponentRegistry';
import { FieldRenderer, FieldDefinition, Input } from './Input';
import { colors } from '../styles';
import { useMemo } from 'react';
import {
    RepeatWrapping,
    ClampToEdgeWrapping,
    SRGBColorSpace,
    LinearSRGBColorSpace,
    Texture,
    Vector2,
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

export interface MaterialProps extends Omit<MeshStandardMaterialProperties & MeshBasicMaterialProperties, 'args' | 'normalScale'> {
    materialType?: 'standard' | 'basic';
    transmission?: number;
    thickness?: number;
    ior?: number;
    texture?: string;
    repeat?: boolean;
    repeatCount?: [number, number];
    generateMipmaps?: boolean;
    minFilter?: string;
    magFilter?: string;
    normalMapTexture?: string;
    normalScale?: [number, number];
}

const PICKER_POPUP_WIDTH = 260;
const PICKER_POPUP_HEIGHT = 360;

function TexturePicker({
    value,
    onChange,
    basePath
}: {
    value: string | undefined;
    onChange: (v: string) => void;
    basePath: string;
}) {
    const [textureFiles, setTextureFiles] = useState<string[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        fetch(`${basePath}/textures/manifest.json`)
            .then(r => r.json())
            .then(data => setTextureFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, [basePath]);

    useLayoutEffect(() => {
        if (!showPicker || !triggerRef.current || typeof window === 'undefined') return;

        const updatePosition = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;

            const preferredLeft = rect.left - PICKER_POPUP_WIDTH - 8;
            const fallbackLeft = rect.right + 8;
            const fitsLeft = preferredLeft >= 8;
            const left = fitsLeft ? preferredLeft : Math.min(fallbackLeft, window.innerWidth - PICKER_POPUP_WIDTH - 8);
            const top = Math.min(Math.max(8, rect.top), window.innerHeight - PICKER_POPUP_HEIGHT - 8);

            setPopupStyle({
                position: 'fixed',
                left,
                top,
                background: colors.bg,
                padding: 12,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                width: PICKER_POPUP_WIDTH,
                height: PICKER_POPUP_HEIGHT,
                overflow: 'hidden',
                zIndex: 1000,
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [showPicker]);

    // Only show 3D preview for server-hosted textures (starting with / or http)
    const canPreview = value && (value.startsWith('/') || value.startsWith('http'));

    return (
        <div style={{ maxHeight: 128, overflow: 'visible', position: 'relative', display: 'flex', alignItems: 'center' }}>
            {canPreview
                ? <SingleTextureViewer file={value} basePath={basePath} />
                : value
                    ? <span style={{ fontSize: 10, opacity: 0.6, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                    : null
            }
            <button
                ref={triggerRef}
                onClick={() => setShowPicker(!showPicker)}
                style={{ padding: '4px 8px', backgroundColor: colors.bgLight, color: 'inherit', fontSize: 10, cursor: 'pointer', border: `1px solid ${colors.border}`, borderRadius: 3, marginTop: 4 }}
            >
                {showPicker ? 'Cancel' : 'Change'}
            </button>
            <button
                onClick={() => {
                    onChange(undefined as any);
                }}
                style={{ padding: '4px 8px', backgroundColor: colors.bgLight, color: 'inherit', fontSize: 10, cursor: 'pointer', border: `1px solid ${colors.border}`, borderRadius: 3, marginTop: 4, marginLeft: 4 }}
            >
                Clear
            </button>
            {showPicker && popupStyle && typeof document !== 'undefined' && createPortal(
                <div style={popupStyle} onMouseLeave={() => setShowPicker(false)}>
                    <TextureListViewer
                        files={textureFiles}
                        selected={value || undefined}
                        onSelect={(file) => {
                            onChange(file);
                            setShowPicker(false);
                        }}
                        basePath={basePath}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}

function MaterialComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const materialType = component.properties.materialType ?? 'standard';
    const hasTexture = !!component.properties.texture;
    const hasRepeat = component.properties.repeat;
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
                    <div style={{ display: 'flex', gap: 2 }}>
                        <Input
                            label="X"
                            value={value?.[0] ?? 1}
                            onChange={v => onChange([v, value?.[1] ?? 1])}
                            min={0.01}
                            max={100}
                            step={0.1}
                        />
                        <Input
                            label="Y"
                            value={value?.[1] ?? 1}
                            onChange={v => onChange([value?.[0] ?? 1, v])}
                            min={0.01}
                            max={100}
                            step={0.1}
                        />
                    </div>
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
                    <div style={{ display: 'flex', gap: 2 }}>
                        <Input
                            label="X"
                            value={value?.[0] ?? 1}
                            onChange={v => onChange([v, value?.[1] ?? 1])}
                            min={0}
                            max={5}
                            step={0.01}
                        />
                        <Input
                            label="Y"
                            value={value?.[1] ?? 1}
                            onChange={v => onChange([value?.[0] ?? 1, v])}
                            min={0}
                            max={5}
                            step={0.01}
                        />
                    </div>
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
function MaterialComponentView({ properties, loadedTextures }: { properties: MaterialProps, loadedTextures?: Record<string, Texture> }) {
    const materialType = properties?.materialType ?? 'standard';
    const textureName = properties?.texture;
    const repeat = properties?.repeat;
    const repeatCount = properties?.repeatCount;
    const generateMipmaps = properties?.generateMipmaps !== false;
    const minFilter = properties?.minFilter || 'LinearMipmapLinearFilter';
    const magFilter = properties?.magFilter || 'LinearFilter';
    const texture = textureName && loadedTextures ? loadedTextures[textureName] : undefined;

    const normalMapTextureName = properties?.normalMapTexture;
    const normalScaleProp = properties?.normalScale;
    const normalMapTexture = normalMapTextureName && loadedTextures ? loadedTextures[normalMapTextureName] : undefined;
    const materialSource: MaterialProps = properties ?? {};

    // Destructure all material props and separate custom texture handling props
    const {
        texture: _texture,
        repeat: _repeat,
        repeatCount: _repeatCount,
        generateMipmaps: _generateMipmaps,
        minFilter: _minFilter,
        magFilter: _magFilter,
        map: _map,
        materialType: _materialType,
        normalMapTexture: _normalMapTexture,
        normalScale: _normalScale,
        normalMap: _normalMap,
        side: sideProp,
        metalness: _metalness,
        roughness: _roughness,
        transmission: _transmission,
        thickness: _thickness,
        ior: _ior,
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
        t.colorSpace = SRGBColorSpace;
        t.generateMipmaps = generateMipmaps;
        t.minFilter = minFilterMap[minFilter] ?? LinearMipmapLinearFilter;
        t.magFilter = magFilterMap[magFilter] ?? LinearFilter;
        t.needsUpdate = true;
        return t;
    }, [texture, repeat, repeatCount?.[0], repeatCount?.[1], generateMipmaps, minFilter, magFilter]);

    const finalNormalMap = useMemo(() => {
        if (!normalMapTexture) return undefined;
        const t = normalMapTexture.clone();
        t.colorSpace = LinearSRGBColorSpace;
        t.needsUpdate = true;
        return t;
    }, [normalMapTexture]);

    const normalScaleVec = useMemo(() => {
        if (!finalNormalMap) return undefined;
        return new Vector2(normalScaleProp?.[0] ?? 1, normalScaleProp?.[1] ?? 1);
    }, [finalNormalMap, normalScaleProp?.[0], normalScaleProp?.[1]]);

    if (!properties) {
        return <meshStandardMaterial color="red" wireframe />;
    }

    const materialKey = finalTexture?.uuid ?? 'no-texture';
    const sharedProps = {
        map: finalTexture,
        side: resolvedSide,
        ...materialProps,
    };

    if (materialType === 'basic') {
        return <meshBasicMaterial key={materialKey} {...sharedProps} />;
    }

    return (
        <meshStandardMaterial
            key={materialKey}
            {...sharedProps}
            normalMap={finalNormalMap}
            normalScale={normalScaleVec}
        />
    );
}

const MaterialComponent: Component = {
    name: 'Material',
    Editor: MaterialComponentEditor,
    View: MaterialComponentView,
    nonComposable: true,
    defaultProperties: {
        materialType: 'standard',
        color: '#ffffff',
        toneMapped: true,
        wireframe: false,
        transparent: false,
        opacity: 1,
        metalness: 0,
        roughness: 1
    }
};

export default MaterialComponent;