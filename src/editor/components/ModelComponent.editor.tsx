import MeshFields from "./MeshFields.js";
import { Texture } from 'three';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { BooleanField, FieldGroup, Label, ListEditor, NumberInput, SelectInput } from '../ui/Input.js';
import type { ComponentData } from '../../core/types.js';
import { useEditorContext, useEditorRef } from '../EditorContext.js';
import { base, colors, ui } from '../ui/styles.js';
import { decomposeModelToPrefabNodes } from '../modelPrefab.js';
import { ModelPicker } from '../assets/AssetBrowser.js';
import { RepeatAxisConfig, normalizeRepeatAxes, ModelProperties } from "../../runtime/components/ModelComponent.js";

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
                            ...ui.secondaryPanel,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
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
                                    ...ui.compactActionButton,
                                    height: 24,
                                    background: colors.bgInput,
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

function ModelComponentEditor({ properties, node, update }: ComponentEditorProps<ModelProperties>) {
    const { positionSnap } = useEditorContext();
    const editor = useEditorRef();
    const { basePath } = editor;
    const repeatAxes = normalizeRepeatAxes(properties.repeatAxes);
    const filename = properties.filename;
    const canDecompose = Boolean(filename);

    const handleDecompose = () => {
        if (!filename) return;

        const model = editor.getModel(filename);
        if (!model) {
            console.warn(`Model is not loaded yet: ${filename}`);
            return;
        }

        const textureRefs = new Map<string, Texture>();
        const decomposed = decomposeModelToPrefabNodes(model, {
            idPrefix: node.id,
            getTexturePath: (texture, usage) => {
                const key = `embedded/${node.id}/${usage}/${texture.uuid}`;
                textureRefs.set(key, texture);
                return key;
            },
        });
        textureRefs.forEach((texture, path) => {
            editor.addTexture(path, texture);
        });
        const preservedComponents = Object.entries(node.components ?? {}).reduce<Record<string, ComponentData>>((result, [key, entry]) => {
            if (!entry?.type) return result;
            if (entry.type === 'Model' || entry.type === 'Geometry' || entry.type === 'BufferGeometry' || entry.type === 'Material') {
                return result;
            }

            result[key] = entry;
            return result;
        }, {});
        const decomposedComponents = Object.entries(decomposed.root.components ?? {}).reduce<Record<string, ComponentData>>((result, [key, entry]) => {
            if (!entry?.type || entry.type === 'Transform') return result;
            result[key] = entry;
            return result;
        }, {});

        editor.replaceNode(node.id, {
            ...node,
            name: node.name ?? decomposed.root.name,
            components: {
                ...preservedComponents,
                ...decomposedComponents,
            },
            children: decomposed.root.children ?? [],
        });
    };

    return (
        <FieldGroup>
            <ModelPicker
                value={filename}
                onChange={(filename) => update({ filename })}
                basePath={basePath}
                pickerKey={node?.id}
            />
            <button
                type="button"
                style={{ ...base.btn, width: '100%' }}
                onClick={handleDecompose}
                disabled={!canDecompose}
                title={canDecompose ? 'Replace this model node with editable geometry and material nodes' : 'Choose a model before decomposing'}
            >
                Decompose Model
            </button>
            <BooleanField
                name="repeat"
                label="Repeat"
                values={properties}
                onChange={update}
                fallback={false}
            />
            {properties.repeat && (
                <RepeatAxisEditor
                    axes={repeatAxes}
                    onChange={(nextAxes) => update({ repeatAxes: nextAxes })}
                    positionSnap={positionSnap}
                />
            )}
            <MeshFields properties={properties} update={update} instancing={properties.repeat === true} />
        </FieldGroup>
    );
}

export default ModelComponentEditor;
