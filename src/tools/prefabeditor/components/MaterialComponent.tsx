import { TextureListViewer } from '../../assetviewer/page';
import { useEffect, useState } from 'react';
import { Component } from './ComponentRegistry';

function MaterialComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const [textureFiles, setTextureFiles] = useState<string[]>([]);

    useEffect(() => {
        const base = basePath ? `${basePath}/` : '';
        fetch(`/${base}textures/manifest.json`)
            .then(r => r.json())
            .then(data => setTextureFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, [basePath]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 4 }}>
                <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Color</label>
                <div style={{ display: 'flex', gap: 2 }}>
                    <input
                        type="color"
                        style={{ height: 20, width: 20, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                        value={component.properties.color}
                        onChange={e => onUpdate({ 'color': e.target.value })}
                    />
                    <input
                        type="text"
                        style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                        value={component.properties.color}
                        onChange={e => onUpdate({ 'color': e.target.value })}
                    />
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <input
                    type="checkbox"
                    style={{ width: 12, height: 12 }}
                    checked={component.properties.wireframe || false}
                    onChange={e => onUpdate({ 'wireframe': e.target.checked })}
                />
                <label style={{ fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)' }}>Wireframe</label>
            </div>

            <div>
                <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Texture</label>
                <div style={{ maxHeight: 128, overflowY: 'auto' }}>
                    <TextureListViewer
                        files={textureFiles}
                        selected={component.properties.texture || undefined}
                        onSelect={(file) => onUpdate({ 'texture': file })}
                        basePath={basePath}
                    />
                </div>
            </div>

            {component.properties.texture && (
                <div style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)', paddingTop: 4, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <input
                            type="checkbox"
                            style={{ width: 12, height: 12 }}
                            checked={component.properties.repeat || false}
                            onChange={e => onUpdate({ 'repeat': e.target.checked })}
                        />
                        <label style={{ fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)' }}>Repeat Texture</label>
                    </div>

                    {component.properties.repeat && (
                        <div>
                            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Repeat (X, Y)</label>
                            <div style={{ display: 'flex', gap: 2 }}>
                                <input
                                    type="number"
                                    style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                                    value={component.properties.repeatCount?.[0] ?? 1}
                                    onChange={e => {
                                        const y = component.properties.repeatCount?.[1] ?? 1;
                                        onUpdate({ 'repeatCount': [parseFloat(e.target.value), y] });
                                    }}
                                />
                                <input
                                    type="number"
                                    style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                                    value={component.properties.repeatCount?.[1] ?? 1}
                                    onChange={e => {
                                        const x = component.properties.repeatCount?.[0] ?? 1;
                                        onUpdate({ 'repeatCount': [x, parseFloat(e.target.value)] });
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


import { useMemo } from 'react';
import { DoubleSide, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace, Texture } from 'three';

// View for Material component
function MaterialComponentView({ properties, loadedTextures }: { properties: any, loadedTextures?: Record<string, Texture> }) {
    const textureName = properties?.texture;
    const repeat = properties?.repeat;
    const repeatCount = properties?.repeatCount;
    const texture = textureName && loadedTextures ? loadedTextures[textureName] : undefined;

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
        t.needsUpdate = true;
        return t;
    }, [texture, repeat, repeatCount?.[0], repeatCount?.[1]]);

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