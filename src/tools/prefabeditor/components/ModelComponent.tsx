import { ModelListViewer } from '../../assetviewer/page';
import { useEffect, useState, useMemo } from 'react';
import { Component } from './ComponentRegistry';

function ModelComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const [modelFiles, setModelFiles] = useState<string[]>([]);

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

    return <div>
        <div className="mb-1">
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Model</label>
            <div className="max-h-32 overflow-y-auto">
                <ModelListViewer
                    files={modelFiles}
                    selected={component.properties.filename ? `/${component.properties.filename}` : undefined}
                    onSelect={handleModelSelect}
                    basePath={basePath}
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