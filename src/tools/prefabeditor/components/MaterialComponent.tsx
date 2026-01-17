import { SingleTextureViewer, TextureListViewer } from '../../assetviewer/page';
import { useEffect, useState } from 'react';
import { Component } from './ComponentRegistry';
import { FieldRenderer, FieldDefinition, Input } from './Input';
import { useMemo } from 'react';
import {
    DoubleSide,
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
    MagnificationTextureFilter
} from 'three';

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
        const base = basePath ? `${basePath}/` : '';
        fetch(`/${base}textures/manifest.json`)
            .then(r => r.json())
            .then(data => setTextureFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, [basePath]);

    return (
        <div style={{ maxHeight: 128, overflowY: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <SingleTextureViewer file={value || undefined} basePath={basePath} />
            <button
                onClick={() => setShowPicker(!showPicker)}
                style={{ padding: '4px 8px', backgroundColor: '#1f2937', color: 'inherit', fontSize: 10, cursor: 'pointer', border: '1px solid rgba(34, 211, 238, 0.3)', marginTop: 4 }}
            >
                {showPicker ? 'Hide' : 'Change'}
            </button>
            {showPicker && (
                <div style={{ position: 'fixed', left: '-10px', top: '50%', transform: 'translate(-100%, -50%)', background: 'rgba(0,0,0,0.9)', padding: 16, border: '1px solid rgba(34, 211, 238, 0.3)', maxHeight: '80vh', overflowY: 'auto', zIndex: 1000 }}>
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
                            value={value?.[0] ?? 1}
                            onChange={v => onChange([v, value?.[1] ?? 1])}
                        />
                        <Input
                            value={value?.[1] ?? 1}
                            onChange={v => onChange([value?.[0] ?? 1, v])}
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
function MaterialComponentView({ properties, loadedTextures }: { properties: any, loadedTextures?: Record<string, Texture> }) {
    const textureName = properties?.texture;
    const repeat = properties?.repeat;
    const repeatCount = properties?.repeatCount;
    const generateMipmaps = properties?.generateMipmaps !== false;
    const minFilter = properties?.minFilter || 'LinearMipmapLinearFilter';
    const magFilter = properties?.magFilter || 'LinearFilter';
    const texture = textureName && loadedTextures ? loadedTextures[textureName] : undefined;

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

    const { color, wireframe = false } = properties;

    return (
        <meshStandardMaterial
            key={finalTexture?.uuid ?? 'no-texture'}
            color={color}
            wireframe={wireframe}
            map={finalTexture}
            transparent={!!finalTexture}
            side={DoubleSide}
        />
    );
}

const MaterialComponent: Component = {
    name: 'Material',
    Editor: MaterialComponentEditor,
    View: MaterialComponentView,
    defaultProperties: {
        color: '#ffffff',
        wireframe: false
    }
};

export default MaterialComponent;