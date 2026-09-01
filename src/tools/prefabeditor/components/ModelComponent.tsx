import { Suspense, useEffect, useMemo, useState } from 'react';
import { Matrix4, Mesh, SkinnedMesh, Texture, type BufferGeometry, type Material, type Object3D } from 'three';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, Label, ListEditor, NumberInput, SelectInput, StringField } from './Input';
import { useSuspenseModelAsset } from '../assetRuntime';
import { useNode } from '../SceneContext';
import type { ComponentData } from '../types';
import { useEditorContext, useEditorRef } from '../EditorContext';
import { base, colors, ui } from '../styles';
import { decomposeModelToPrefabNodes } from '../modelPrefab';
import { withBasePath } from '../runtimeUtils';
import { usePrefab } from '../SceneContext';
import { useMeshInstanceRegistration } from '../MeshInstanceProvider';
import { ModelPicker } from '../../assetviewer/page';

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

type RepeatAxisConfig = {
    axis: 'x' | 'y' | 'z';
    count: number;
    offset: number;
};

const DEFAULT_REPEAT_AXES: RepeatAxisConfig[] = [{ axis: 'x', count: 1, offset: 1 }];

function normalizeRepeatAxes(value: unknown): RepeatAxisConfig[] {
    if (!Array.isArray(value)) return DEFAULT_REPEAT_AXES;
    const seen = new Set<string>();
    const axes: RepeatAxisConfig[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const { axis, count, offset } = entry as Partial<RepeatAxisConfig>;
        if ((axis !== 'x' && axis !== 'y' && axis !== 'z') || seen.has(axis)) continue;
        seen.add(axis);
        axes.push({
            axis,
            count: Number.isFinite(Number(count)) ? Math.max(1, Math.floor(Number(count))) : 1,
            offset: Number.isFinite(Number(offset)) ? Number(offset) : 1,
        });
    }
    return axes.length ? axes : DEFAULT_REPEAT_AXES;
}

function getRepeatPositions(properties: ModelProperties): [number, number, number][] {
    if (!properties.repeat) return [];
    const counts: [number, number, number] = [1, 1, 1];
    const offsets: [number, number, number] = [0, 0, 0];
    for (const entry of normalizeRepeatAxes(properties.repeatAxes)) {
        const index = entry.axis === 'x' ? 0 : entry.axis === 'y' ? 1 : 2;
        counts[index] = entry.count;
        offsets[index] = entry.offset;
    }
    const positions: [number, number, number][] = [];
    for (let x = 0; x < counts[0]; x++) {
        for (let y = 0; y < counts[1]; y++) {
            for (let z = 0; z < counts[2]; z++) {
                positions.push([x * offsets[0], y * offsets[1], z * offsets[2]]);
            }
        }
    }
    return positions;
}

function canInstance(model: Object3D) {
    if (model.animations.length) return false;
    let hasMesh = false;
    let hasSkinnedMesh = false;
    model.traverse(object => {
        if (object instanceof SkinnedMesh) hasSkinnedMesh = true;
        else if (object instanceof Mesh) hasMesh = true;
    });
    return hasMesh && !hasSkinnedMesh;
}

type ModelProperties = {
    filename?: string;
    emitClickEvent?: boolean;
    clickEventName?: string;
    repeat?: boolean;
    repeatAxes?: RepeatAxisConfig[];
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
        Object.entries(decomposed.materials).forEach(([id, material]) => {
            editor.setMaterial(id, material);
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
                name="emitClickEvent"
                label="Emit Click Event"
                values={properties}
                onChange={update}
                fallback={false}
            />
            {properties.emitClickEvent ? (
                <StringField
                    name="clickEventName"
                    label="Click Event Name"
                    values={properties}
                    onChange={update}
                    placeholder="node:click"
                />
            ) : null}
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
        </FieldGroup>
    );
}

function ClonedModel({ source }: { source: Object3D }) {
    const model = useMemo(() => {
        const clone = source.clone();
        clone.traverse(object => {
            if (object instanceof Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        return clone;
    }, [source]);

    return <primitive object={model} />;
}

type RepeatedModelPart = {
    geometry: BufferGeometry;
    material: Material | Material[];
    castShadow: boolean;
    receiveShadow: boolean;
};

function RepeatedMesh({
    id,
    part,
    position,
    instanced,
}: {
    id: string;
    part: RepeatedModelPart;
    position: [number, number, number];
    instanced: boolean;
}) {
    const [mesh, setMesh] = useState<Mesh | null>(null);
    useMeshInstanceRegistration(id, mesh, instanced);
    return <mesh
        ref={setMesh}
        position={position}
        geometry={part.geometry}
        material={part.material}
        castShadow={part.castShadow}
        receiveShadow={part.receiveShadow}
        frustumCulled={false}
    />;
}

function RepeatedModel({ source, positions, interactive }: {
    source: Object3D;
    positions: [number, number, number][];
    interactive: boolean;
}) {
    const { runtimeNodeId, isSelected } = useNode();
    const parts = useMemo(() => {
        const result: RepeatedModelPart[] = [];
        source.updateWorldMatrix(false, true);
        const rootInverse = new Matrix4().copy(source.matrixWorld).invert();
        source.traverse(object => {
            if (!(object instanceof Mesh)) return;
            const geometry = object.geometry.clone();
            geometry.applyMatrix4(object.matrixWorld.clone().premultiply(rootInverse));
            geometry.userData.prefabGeometrySignature = `repeated-model:${source.uuid}:${object.uuid}`;
            result.push({
                geometry,
                material: object.material,
                castShadow: true,
                receiveShadow: true,
            });
        });
        return result;
    }, [source]);

    useEffect(() => () => {
        parts.forEach(part => part.geometry.dispose());
    }, [parts]);

    const instanced = !interactive && !isSelected;
    return <group>
        {positions.map((position, instanceIndex) => parts.map((part, partIndex) => (
            <RepeatedMesh
                key={`${instanceIndex}:${partIndex}`}
                id={`${runtimeNodeId}:repeat:${instanceIndex}:${partIndex}`}
                part={part}
                position={position}
                instanced={instanced}
            />
        )))}
    </group>;
}

function LoadedModel({ properties }: { properties: ModelProperties }) {
    const { basePath } = usePrefab();
    const { nodeInteractionHandlers } = useNode();
    const interactive = Boolean(nodeInteractionHandlers);
    const path = properties.filename ? withBasePath(basePath, properties.filename) : '';
    const sourceModel = useSuspenseModelAsset(path);
    const positions = useMemo(() => getRepeatPositions(properties), [properties.repeat, properties.repeatAxes]);
    const model = sourceModel && (positions.length > 1 && canInstance(sourceModel)
        ? <RepeatedModel source={sourceModel} positions={positions} interactive={interactive} />
        : <ClonedModel source={sourceModel} />);
    return model;
}

function ModelComponentView({ properties, children }: ComponentViewProps<ModelProperties>) {
    return <>
        <Suspense fallback={null}><LoadedModel properties={properties} /></Suspense>
        {children}
    </>;
}

const ModelComponent: Component<ModelProperties> = {
    name: 'Model',
    renderWhenDisabled: true,
    attach: 'object',
    Editor: ModelComponentEditor,
    View: ModelComponentView,
    properties: {
        filename: { type: 'string', default: '' },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: '' },
        repeat: { type: 'boolean', default: false },
        repeatAxes: { type: 'array', default: [{ axis: 'x', count: 1, offset: 1 }] },
    },
};

export default ModelComponent;
