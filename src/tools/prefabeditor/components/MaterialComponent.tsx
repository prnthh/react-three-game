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
        <div className="flex flex-col">
            <div className="mb-1">
                <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Color</label>
                <div className="flex gap-0.5">
                    <input
                        type="color"
                        className="h-5 w-5 bg-transparent border-none cursor-pointer"
                        value={component.properties.color}
                        onChange={e => onUpdate({ 'color': e.target.value })}
                    />
                    <input
                        type="text"
                        className="flex-1 bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                        value={component.properties.color}
                        onChange={e => onUpdate({ 'color': e.target.value })}
                    />
                </div>
            </div>
            <div className="flex items-center gap-1 mb-1">
                <input
                    type="checkbox"
                    className="w-3 h-3"
                    checked={component.properties.wireframe || false}
                    onChange={e => onUpdate({ 'wireframe': e.target.checked })}
                />
                <label className="text-[9px] text-cyan-400/60">Wireframe</label>
            </div>

            <div>
                <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Texture</label>
                <div className="max-h-32 overflow-y-auto">
                    <TextureListViewer
                        files={textureFiles}
                        selected={component.properties.texture || undefined}
                        onSelect={(file) => onUpdate({ 'texture': file })}
                        basePath={basePath}
                    />
                </div>
            </div>

            {component.properties.texture && (
                <div className="border-t border-cyan-500/20 pt-1 mt-1">
                    <div className="flex items-center gap-1 mb-1">
                        <input
                            type="checkbox"
                            className="w-3 h-3"
                            checked={component.properties.repeat || false}
                            onChange={e => onUpdate({ 'repeat': e.target.checked })}
                        />
                        <label className="text-[9px] text-cyan-400/60">Repeat Texture</label>
                    </div>

                    {component.properties.repeat && (
                        <div>
                            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Repeat (X, Y)</label>
                            <div className="flex gap-0.5">
                                <input
                                    type="number"
                                    className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                                    value={component.properties.repeatCount?.[0] ?? 1}
                                    onChange={e => {
                                        const y = component.properties.repeatCount?.[1] ?? 1;
                                        onUpdate({ 'repeatCount': [parseFloat(e.target.value), y] });
                                    }}
                                />
                                <input
                                    type="number"
                                    className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
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
function MaterialComponentView({ properties, loadedTextures, isSelected }: { properties: any, loadedTextures?: Record<string, Texture>, isSelected?: boolean }) {
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
    const displayColor = isSelected ? "cyan" : color;

    return (
        <meshStandardMaterial
            key={finalTexture?.uuid ?? 'no-texture'}
            color={displayColor}
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