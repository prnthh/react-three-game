import { ModelListViewer, SingleModelViewer } from '../../assetviewer/page';
import { useEffect, useState, useMemo } from 'react';
import { Component } from './ComponentRegistry';
import { Label } from './Input';
import { GameObject } from '../types';

function ModelComponentEditor({ component, node, onUpdate, basePath = "" }: { component: any; node?: GameObject; onUpdate: (newComp: any) => void; basePath?: string }) {
    const [modelFiles, setModelFiles] = useState<string[]>([]);
    const [showPicker, setShowPicker] = useState(false);

    useEffect(() => {
        const base = basePath ? `${basePath}/` : '';
        fetch(`/${base}models/manifest.json`)
            .then(r => r.json())
            .then(data => setModelFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, [basePath]);

    const handleModelSelect = (file: string) => {
        // Remove leading slash for prefab compatibility
        const filename = file.startsWith('/') ? file.slice(1) : file;
        onUpdate({ 'filename': filename });
    };

    return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
            <Label>Model File</Label>
            <div style={{ maxHeight: 128, overflowY: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
                <SingleModelViewer file={component.properties.filename ? `/${component.properties.filename}` : undefined} basePath={basePath} />
                <button
                    onClick={() => setShowPicker(!showPicker)}
                    style={{ padding: '4px 8px', backgroundColor: '#1f2937', color: 'inherit', fontSize: 10, cursor: 'pointer', border: '1px solid rgba(34, 211, 238, 0.3)', marginTop: 4 }}
                >
                    {showPicker ? 'Hide' : 'Change'}
                </button>
                {showPicker && (
                    <div style={{ position: 'fixed', left: '-10px', top: '50%', transform: 'translate(-100%, -50%)', background: 'rgba(0,0,0,0.9)', padding: 16, border: '1px solid rgba(34, 211, 238, 0.3)', maxHeight: '80vh', overflowY: 'auto', zIndex: 1000 }}>
                        <ModelListViewer
                            key={node?.id}
                            files={modelFiles}
                            selected={component.properties.filename ? `/${component.properties.filename}` : undefined}
                            onSelect={(file) => {
                                handleModelSelect(file);
                                setShowPicker(false);
                            }}
                            basePath={basePath}
                        />
                    </div>
                )}
            </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
                type="checkbox"
                id="instanced-checkbox"
                checked={component.properties.instanced || false}
                onChange={e => onUpdate({ instanced: e.target.checked })}
                style={{ width: 12, height: 12 }}
            />
            <label htmlFor="instanced-checkbox" style={{ fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)' }}>Instanced</label>
        </div>
    </div>;
}

// View for Model component
function ModelComponentView({ properties, loadedModels, children }: { properties: any, loadedModels?: Record<string, any>, children?: React.ReactNode }) {
    // Instanced models are handled elsewhere (GameInstance), so only render non-instanced here
    if (!properties.filename || properties.instanced) return <>{children}</>;

    const sourceModel = loadedModels?.[properties.filename];

    // Clone model once and set up shadows - memoized to avoid cloning on every render
    const clonedModel = useMemo(() => {
        if (!sourceModel) return null;
        const clone = sourceModel.clone();
        clone.traverse((obj: any) => {
            if (obj.isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
            }
        });
        return clone;
    }, [sourceModel]);

    if (!clonedModel) return <>{children}</>;

    return <primitive object={clonedModel}>{children}</primitive>;
}

const ModelComponent: Component = {
    name: 'Model',
    Editor: ModelComponentEditor,
    View: ModelComponentView,
    defaultProperties: {
        filename: '',
        instanced: false
    }
};

export default ModelComponent;