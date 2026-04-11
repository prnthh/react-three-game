import { ModelPicker } from '../../assetviewer/page';
import { useContext, useMemo } from 'react';
import { Component } from './ComponentRegistry';
import { BooleanField, FieldGroup, Label, ListEditor, NumberInput, SelectInput } from './Input';
import { useSceneRuntime } from '../PrefabRoot';
import { GameObject } from '../types';
import { EditorContext } from '../PrefabEditor';
import { DEFAULT_REPEAT_AXES, getRepeatAxesFromModelProperties, normalizeRepeatAxes, RepeatAxisConfig } from '../InstanceProvider';
import { colors } from '../styles';

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
    const addAxis = (axisValue: string) => {
        if (!axisValue) return;

        onChange([...axes, { axis: axisValue as RepeatAxis['axis'], count: 1, offset: 1 }]);
    };

    const updateAxis = (index: number, patch: Partial<RepeatAxis>) => {
        const nextAxes = axes.map((axis, axisIndex) => axisIndex === index ? { ...axis, ...patch } : axis);
        onChange(normalizeRepeatAxes(nextAxes));
    };

    const removeAxis = (index: number) => {
        onChange(axes.filter((_, axisIndex) => axisIndex !== index));
    };

    const availableAxisOptions = AXIS_OPTIONS.filter(option => !axes.some(axis => axis.axis === option.value));

    return (
        <ListEditor
            label="Repeat Axes"
            items={axes}
            onAdd={addAxis}
            addOptions={availableAxisOptions as { value: string; label: string }[]}
            canAdd={availableAxisOptions.length > 0}
            emptyMessage="No repeat axes added."
            addButtonTitle="Add repeat axis"
            addDisabledTitle="All axes already in use"
            renderItem={(axisConfig, index) => {
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
            }}
        />
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
                pickerKey={node?.id}
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
function ModelComponentView({ properties, children }: { properties: any, children?: React.ReactNode }) {
    const { getModel } = useSceneRuntime();
    // Instanced models are handled elsewhere (GameInstance), so only render non-instanced here
    if (!properties.filename || properties.instanced) return <>{children}</>;

    const sourceModel = getModel(properties.filename);

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
        instanced: false,
        repeat: false,
        repeatAxes: DEFAULT_REPEAT_AXES
    },
    getAssetRefs: (properties) => {
        if (properties.filename) return [{ type: 'model', path: properties.filename }];
        return [];
    },
};

export default ModelComponent;