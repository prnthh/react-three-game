import { ModelListViewer, SingleModelViewer } from '../../assetviewer/page';
import { useContext, useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Component } from './ComponentRegistry';
import { BooleanField, FieldGroup, Label, NumberInput, SelectInput } from './Input';
import { GameObject } from '../types';
import { EditorContext } from '../EditorContext';
import { DEFAULT_REPEAT_AXES, getRepeatAxesFromModelProperties, normalizeRepeatAxes, RepeatAxisConfig } from '../InstanceProvider';
import { colors } from '../styles';

const PICKER_POPUP_WIDTH = 260;
const PICKER_POPUP_HEIGHT = 360;
const AXIS_OPTIONS = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
    { value: 'z', label: 'Z' },
] as const;

type RepeatAxis = {
    axis: RepeatAxisConfig['axis'];
    count: number;
    offset: number;
};

function quantize(value: number, step: number) {
    if (!Number.isFinite(value)) return 0;
    if (!Number.isFinite(step) || step <= 0) return value;
    return Math.round(value / step) * step;
}

function RepeatAxisEditor({
    axes,
    onChange,
    positionSnap,
}: {
    axes: RepeatAxis[];
    onChange: (axes: RepeatAxis[]) => void;
    positionSnap: number;
}) {
    const addAxis = () => {
        const used = new Set(axes.map(axis => axis.axis));
        const nextAxis = AXIS_OPTIONS.find(option => !used.has(option.value));
        if (!nextAxis) return;

        onChange([...axes, { axis: nextAxis.value, count: 1, offset: 1 }]);
    };

    const updateAxis = (index: number, patch: Partial<RepeatAxis>) => {
        const nextAxes = axes.map((axis, axisIndex) => axisIndex === index ? { ...axis, ...patch } : axis);
        onChange(normalizeRepeatAxes(nextAxes));
    };

    const removeAxis = (index: number) => {
        onChange(axes.filter((_, axisIndex) => axisIndex !== index));
    };

    const canAddAxis = axes.length < AXIS_OPTIONS.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Label>Repeat Axes</Label>
                <button
                    type="button"
                    onClick={addAxis}
                    disabled={!canAddAxis}
                    style={{
                        width: 22,
                        height: 22,
                        borderRadius: 3,
                        border: `1px solid ${canAddAxis ? colors.accentBorder : colors.border}`,
                        background: canAddAxis ? colors.accentBg : colors.bgSurface,
                        color: canAddAxis ? colors.accent : colors.textMuted,
                        cursor: canAddAxis ? 'pointer' : 'not-allowed',
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0,
                    }}
                    title={canAddAxis ? 'Add repeat axis' : 'All axes already in use'}
                >
                    +
                </button>
            </div>
            {axes.map((axisConfig, index) => {
                const usedByOthers = new Set(axes.filter((_, axisIndex) => axisIndex !== index).map(axis => axis.axis));
                const axisOptions = AXIS_OPTIONS.filter(option => option.value === axisConfig.axis || !usedByOthers.has(option.value));

                return (
                    <div
                        key={`${axisConfig.axis}-${index}`}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            padding: 8,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 4,
                            background: colors.bgSurface,
                        }}
                    >
                        <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <SelectInput
                                    label="Axis"
                                    value={axisConfig.axis}
                                    onChange={(axis) => updateAxis(index, { axis: axis as RepeatAxis['axis'] })}
                                    options={axisOptions as { value: string; label: string }[]}
                                />
                            </div>
                            {index > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => removeAxis(index)}
                                    style={{
                                        height: 24,
                                        width: 28,
                                        borderRadius: 3,
                                        border: `1px solid ${colors.border}`,
                                        background: colors.bgInput,
                                        color: colors.text,
                                        cursor: 'pointer',
                                        padding: 0,
                                        flexShrink: 0,
                                    }}
                                    title="Remove repeat axis"
                                >
                                    ×
                                </button>
                            ) : null}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div>
                                <Label>Count</Label>
                                <NumberInput
                                    value={axisConfig.count}
                                    onChange={(count) => updateAxis(index, { count: Math.max(1, Math.floor(count)) })}
                                    step={1}
                                    min={1}
                                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <Label>Offset</Label>
                                <NumberInput
                                    value={axisConfig.offset}
                                    onChange={(offset) => updateAxis(index, { offset: quantize(offset, positionSnap) })}
                                    step={positionSnap > 0 ? positionSnap : 0.1}
                                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

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
        <div style={{ maxHeight: 160, overflow: 'visible', position: 'relative', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ flex: '0 0 auto' }}>
                <SingleModelViewer file={value ? `/${value}` : undefined} basePath={basePath} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 84px', minWidth: 84, justifyContent: 'flex-end' }}>
                <button
                    ref={triggerRef}
                    onClick={() => setShowPicker(!showPicker)}
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        backgroundColor: '#1f2937',
                        color: 'inherit',
                        fontSize: 10,
                        cursor: 'pointer',
                        border: '1px solid rgba(34, 211, 238, 0.3)',
                    }}
                >
                    {showPicker ? 'Cancel' : 'Change'}
                </button>
                <button
                    onClick={() => {
                        onChange(undefined as any);
                    }}
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        backgroundColor: '#1f2937',
                        color: 'inherit',
                        fontSize: 10,
                        cursor: 'pointer',
                        border: '1px solid rgba(34, 211, 238, 0.3)',
                    }}
                >
                    Clear
                </button>
            </div>
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
    const editorContext = useContext(EditorContext);
    const positionSnap = editorContext?.positionSnap ?? 0.5;
    const repeatAxes = getRepeatAxesFromModelProperties(component.properties);

    return (
        <FieldGroup>
            <ModelPicker
                value={component.properties.filename}
                onChange={(filename) => onUpdate({ filename })}
                basePath={basePath}
                nodeId={node?.id}
            />
            <BooleanField
                name="instanced"
                label="Instanced"
                values={component.properties}
                onChange={onUpdate}
                fallback={false}
            />
            {component.properties.instanced && (
                <>
                    <BooleanField
                        name="repeat"
                        label="Repeat"
                        values={component.properties}
                        onChange={onUpdate}
                        fallback={false}
                    />
                    {component.properties.repeat && (
                        <RepeatAxisEditor
                            axes={repeatAxes}
                            onChange={(nextAxes) => onUpdate({ repeatAxes: nextAxes })}
                            positionSnap={positionSnap}
                        />
                    )}
                </>
            )}
        </FieldGroup>
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
        instanced: false,
        repeat: false,
        repeatAxes: DEFAULT_REPEAT_AXES
    }
};

export default ModelComponent;