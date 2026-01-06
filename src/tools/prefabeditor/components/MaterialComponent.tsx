import { SingleTextureViewer, TextureListViewer } from '../../assetviewer/page';
import { useEffect, useState } from 'react';
import { Component } from './ComponentRegistry';
import { Input, Label } from './Input';
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

function MaterialComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const [textureFiles, setTextureFiles] = useState<string[]>([]);
    const [showPicker, setShowPicker] = useState(false);

    useEffect(() => {
        const base = basePath ? `${basePath}/` : '';
        fetch(`/${base}textures/manifest.json`)
            .then(r => r.json())
            .then(data => setTextureFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, [basePath]);

    const textInputStyle = {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>
                <Label>Color</Label>
                <div style={{ display: 'flex', gap: 2 }}>
                    <input
                        type="color"
                        style={{ height: 20, width: 20, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                        value={component.properties.color}
                        onChange={e => onUpdate({ color: e.target.value })}
                    />
                    <input
                        type="text"
                        style={textInputStyle}
                        value={component.properties.color}
                        onChange={e => onUpdate({ color: e.target.value })}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                    type="checkbox"
                    style={{ width: 12, height: 12 }}
                    checked={component.properties.wireframe || false}
                    onChange={e => onUpdate({ wireframe: e.target.checked })}
                />
                <label style={{ fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)' }}>Wireframe</label>
            </div>

            <div>
                <Label>Texture File</Label>
                <div style={{ maxHeight: 128, overflowY: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <SingleTextureViewer file={component.properties.texture || undefined} basePath={basePath} />
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
                                selected={component.properties.texture || undefined}
                                onSelect={(file) => {
                                    onUpdate({ texture: file });
                                    setShowPicker(false);
                                }}
                                basePath={basePath}
                            />
                        </div>
                    )}
                </div>

            </div>

            {component.properties.texture && (
                <div style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)', paddingTop: 4, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <input
                            type="checkbox"
                            style={{ width: 12, height: 12 }}
                            checked={component.properties.repeat || false}
                            onChange={e => onUpdate({ repeat: e.target.checked })}
                        />
                        <label style={{ fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)' }}>Repeat Texture</label>
                    </div>

                    {component.properties.repeat && (
                        <div>
                            <Label>Repeat (X, Y)</Label>
                            <div style={{ display: 'flex', gap: 2 }}>
                                <Input
                                    value={component.properties.repeatCount?.[0] ?? 1}
                                    onChange={value => {
                                        const y = component.properties.repeatCount?.[1] ?? 1;
                                        onUpdate({ repeatCount: [value, y] });
                                    }}
                                />
                                <Input
                                    value={component.properties.repeatCount?.[1] ?? 1}
                                    onChange={value => {
                                        const x = component.properties.repeatCount?.[0] ?? 1;
                                        onUpdate({ repeatCount: [x, value] });
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <input
                                type="checkbox"
                                style={{ width: 12, height: 12 }}
                                checked={component.properties.generateMipmaps !== false}
                                onChange={e => onUpdate({ generateMipmaps: e.target.checked })}
                            />
                            <label style={{ fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)' }}>Generate Mipmaps</label>
                        </div>

                        <div>
                            <Label>Min Filter</Label>
                            <select
                                style={{ ...textInputStyle, width: '100%', cursor: 'pointer' }}
                                value={component.properties.minFilter || 'LinearMipmapLinearFilter'}
                                onChange={e => onUpdate({ minFilter: e.target.value })}
                            >
                                <option value="NearestFilter">Nearest</option>
                                <option value="NearestMipmapNearestFilter">Nearest Mipmap Nearest</option>
                                <option value="NearestMipmapLinearFilter">Nearest Mipmap Linear</option>
                                <option value="LinearFilter">Linear</option>
                                <option value="LinearMipmapNearestFilter">Linear Mipmap Nearest</option>
                                <option value="LinearMipmapLinearFilter">Linear Mipmap Linear (Default)</option>
                            </select>
                        </div>

                        <div style={{ marginTop: 4 }}>
                            <Label>Mag Filter</Label>
                            <select
                                style={{ ...textInputStyle, width: '100%', cursor: 'pointer' }}
                                value={component.properties.magFilter || 'LinearFilter'}
                                onChange={e => onUpdate({ magFilter: e.target.value })}
                            >
                                <option value="NearestFilter">Nearest</option>
                                <option value="LinearFilter">Linear (Default)</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

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