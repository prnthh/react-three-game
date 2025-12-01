import { ModelListViewer } from '../../assetviewer/page';
import { useEffect, useState } from 'react';
import { Component } from './ComponentRegistry';

function ModelComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const [modelFiles, setModelFiles] = useState<string[]>([]);

    useEffect(() => {
        fetch('/models/manifest.json')
            .then(r => r.json())
            .then(data => setModelFiles(Array.isArray(data) ? data : data.files || []))
            .catch(console.error);
    }, []);

    const handleModelSelect = (file: string) => {
        // Remove leading slash for prefab compatibility
        const filename = file.startsWith('/') ? file.slice(1) : file;
        onUpdate({ 'filename': filename });
    };

    return <div>
        <div className="mb-1">
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Model</label>
            <div className="max-h-32 overflow-y-auto">
                <ModelListViewer
                    files={modelFiles}
                    selected={component.properties.filename ? `/${component.properties.filename}` : undefined}
                    onSelect={handleModelSelect}
                />
            </div>
        </div>
        <div className="flex items-center gap-1">
            <input
                type="checkbox"
                id="instanced-checkbox"
                checked={component.properties.instanced || false}
                onChange={e => onUpdate({ 'instanced': e.target.checked })}
                className="w-3 h-3"
            />
            <label htmlFor="instanced-checkbox" className="text-[9px] text-cyan-400/60">Instanced</label>
        </div>
    </div>;
}

// View for Model component
function ModelComponentView({ properties, loadedModels, children }: { properties: any, loadedModels?: Record<string, any>, children?: React.ReactNode }) {
    // Instanced models are handled elsewhere (GameInstance), so only render non-instanced here
    if (!properties.filename || properties.instanced) return children || null;
    if (loadedModels && loadedModels[properties.filename]) {
        return <>{<primitive object={loadedModels[properties.filename].clone()} />}{children}</>;
    }
    // Optionally, render a placeholder if model is not loaded
    return children || null;
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