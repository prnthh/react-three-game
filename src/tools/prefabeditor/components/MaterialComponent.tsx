import { SingleTextureViewer, TextureListViewer } from '../../assetviewer/page';
import { useEffect, useState } from 'react';
import { Component } from './ComponentRegistry';
import { FieldRenderer, FieldDefinition, Input } from './Input';
import { colors } from '../styles';
import { useMemo } from 'react';
import {
    RepeatWrapping,
    ClampToEdgeWrapping,
    SRGBColorSpace,
    Texture,
    NearestFilter,
    LinearFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    LinearMipmapNearestFilter,
    LinearMipmapLinearFilter,
    MinificationTextureFilter,
    MagnificationTextureFilter,
    MeshStandardMaterialProperties
} from 'three';

export interface MaterialProps extends Omit<MeshStandardMaterialProperties, 'args'> {
    texture?: string;
    repeat?: boolean;
    repeatCount?: [number, number];
    generateMipmaps?: boolean;
    minFilter?: string;
    magFilter?: string;
}

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

    useEffect(() => {
        fetch(`${basePath}/textures/manifest.json`)
            .then(r => r.json())
            .then(data => setTextureFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, [basePath]);

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
            {showPicker && (
                <div style={{ position: 'fixed', right: 60, top: 60, transform: 'translate(-100%,0%)', background: colors.bg, padding: 16, border: `1px solid ${colors.border}`, borderRadius: 4, maxHeight: '80vh', overflowY: 'auto', overflowX: 'hidden', width: 220, zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.6)' }}>
                    <TextureListViewer
                        files={textureFiles}
                        selected={value || undefined}
                        onSelect={(file) => {
                            onChange(file);
                            setShowPicker(false);
                        }}
                        basePath={basePath}
                    />
                </div>
            )}
        </div>
    );
}

function MaterialComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const hasTexture = !!component.properties.texture;
    const hasRepeat = component.properties.repeat;

    const fields: FieldDefinition[] = [
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'wireframe', type: 'boolean', label: 'Wireframe' },
        { name: 'transparent', type: 'boolean', label: 'Transparent' },
        { name: 'opacity', type: 'number', label: 'Opacity', min: 0, max: 1, step: 0.01 },
        { name: 'metalness', type: 'number', label: 'Metalness', min: 0, max: 1, step: 0.01 },
        { name: 'roughness', type: 'number', label: 'Roughness', min: 0, max: 1, step: 0.01 },
        { name: 'transmission', type: 'number', label: 'Transmission', min: 0, max: 1, step: 0.01 },
        { name: 'thickness', type: 'number', label: 'Thickness', min: 0, step: 0.1 },
        { name: 'ior', type: 'number', label: 'IOR (Index of Refraction)', min: 1, max: 2.333, step: 0.01 },
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
    const textureName = properties?.texture;
    const repeat = properties?.repeat;
    const repeatCount = properties?.repeatCount;
    const generateMipmaps = properties?.generateMipmaps !== false;
    const minFilter = properties?.minFilter || 'LinearMipmapLinearFilter';
    const magFilter = properties?.magFilter || 'LinearFilter';
    const texture = textureName && loadedTextures ? loadedTextures[textureName] : undefined;

    // Destructure all material props and separate custom texture handling props
    const {
        texture: _texture,
        repeat: _repeat,
        repeatCount: _repeatCount,
        generateMipmaps: _generateMipmaps,
        minFilter: _minFilter,
        magFilter: _magFilter,
        map: _map, // Filter out map since we set it explicitly
        ...materialProps
    } = properties || {};

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

    if (!properties) {
        return <meshStandardMaterial color="red" wireframe />;
    }

    return (
        <meshStandardMaterial
            key={finalTexture?.uuid ?? 'no-texture'}
            map={finalTexture}
            {...materialProps}
        />
    );
}

const MaterialComponent: Component = {
    name: 'Material',
    Editor: MaterialComponentEditor,
    View: MaterialComponentView,
    nonComposable: true,
    defaultProperties: {
        color: '#ffffff',
        wireframe: false,
        transparent: false,
        opacity: 1,
        metalness: 0,
        roughness: 1
    }
};

export default MaterialComponent;