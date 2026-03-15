import { ModelListViewer, SingleModelViewer } from '../../assetviewer/page';
import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Component } from './ComponentRegistry';
import { FieldRenderer, FieldDefinition } from './Input';
import { GameObject } from '../types';

const PICKER_POPUP_WIDTH = 260;
const PICKER_POPUP_HEIGHT = 360;

function ModelPicker({
    value,
    onChange,
    basePath,
    nodeId
}: {
    value: string | undefined;
    onChange: (v: string) => void;
    basePath: string;
    nodeId?: string;
}) {
    const [modelFiles, setModelFiles] = useState<string[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        fetch(`${basePath}/models/manifest.json`)
            .then(r => r.json())
            .then(data => setModelFiles(Array.isArray(data) ? data : data.files || []))
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
                background: 'rgba(0,0,0,0.9)',
                padding: 12,
                border: '1px solid rgba(34, 211, 238, 0.3)',
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

    const handleModelSelect = (file: string) => {
        const filename = file.startsWith('/') ? file.slice(1) : file;
        onChange(filename);
        setShowPicker(false);
    };

    return (
        <div style={{ maxHeight: 128, overflow: 'visible', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <SingleModelViewer file={value ? `/${value}` : undefined} basePath={basePath} />
            <button
                ref={triggerRef}
                onClick={() => setShowPicker(!showPicker)}
                style={{ padding: '4px 8px', backgroundColor: '#1f2937', color: 'inherit', fontSize: 10, cursor: 'pointer', border: '1px solid rgba(34, 211, 238, 0.3)', marginTop: 4 }}
            >
                {showPicker ? 'Cancel' : 'Change'}
            </button>
            <button
                onClick={() => {
                    onChange(undefined as any);
                }}
                style={{ padding: '4px 8px', backgroundColor: '#1f2937', color: 'inherit', fontSize: 10, cursor: 'pointer', border: '1px solid rgba(34, 211, 238, 0.3)', marginTop: 4, marginLeft: 4 }}
            >
                Clear
            </button>
            {showPicker && popupStyle && typeof document !== 'undefined' && createPortal(
                <div style={popupStyle} onMouseLeave={() => setShowPicker(false)}>
                    <ModelListViewer
                        key={nodeId}
                        files={modelFiles}
                        selected={value ? `/${value}` : undefined}
                        onSelect={handleModelSelect}
                        basePath={basePath}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}

function ModelComponentEditor({ component, node, onUpdate, basePath = "" }: { component: any; node?: GameObject; onUpdate: (newComp: any) => void; basePath?: string }) {
    const fields: FieldDefinition[] = [
        {
            name: 'filename',
            type: 'custom',
            label: 'Model File',
            render: ({ value, onChange }) => (
                <ModelPicker
                    value={value}
                    onChange={onChange}
                    basePath={basePath}
                    nodeId={node?.id}
                />
            ),
        },
        { name: 'instanced', type: 'boolean', label: 'Instanced' },
    ];

    return (
        <FieldRenderer
            fields={fields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
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
    nonComposable: true,
    defaultProperties: {
        filename: '',
        instanced: false
    }
};

export default ModelComponent;