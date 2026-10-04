import { meshProperties, type MeshProperties } from "../rendering/meshProperties.js";
import { useModelMeshSettings } from "../rendering/useModelMeshSettings.js";
import { AssetBoundary } from '../assets/AssetBoundary.js';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { Matrix4, Mesh, SkinnedMesh, type BufferGeometry, type Material, type Object3D } from 'three';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

import { useModelAsset } from '../assets/AssetRuntime.js';

import { useGameObject, useNode } from '../scene/SceneContext.js';

import { withBasePath } from "../assets/assetPaths.js";

import { usePrefab } from '../scene/SceneContext.js';

import { useMeshInstanceRegistration, useInvalidateMeshInstances } from '../rendering/MeshInstanceProvider.js';

export type RepeatAxisConfig = {
    axis: 'x' | 'y' | 'z';
    count: number;
    offset: number;
};

export const DEFAULT_REPEAT_AXES: RepeatAxisConfig[] = [{ axis: 'x', count: 1, offset: 1 }];

export function normalizeRepeatAxes(value: unknown): RepeatAxisConfig[] {
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

export type ModelProperties = MeshProperties & {
    filename?: string;
    repeat?: boolean;
    repeatAxes?: RepeatAxisConfig[];
};

function ClonedModel({ source, properties }: { source: Object3D; properties: ModelProperties }) {
    const model = useMemo(() => source.clone(), [source]);
    useModelMeshSettings(model, properties);
    return <primitive object={model} />;
}

type RepeatedModelPart = {
    geometry: BufferGeometry;
    material: Material | Material[];
};

function RepeatedMesh({
    id,
    part,
    position,
    instanced,
    properties,
}: {
    id: string;
    part: RepeatedModelPart;
    position: [number, number, number];
    instanced: boolean;
    properties: ModelProperties;
}) {
    const mesh = useRef<Mesh>(null);
    useMeshInstanceRegistration(id, mesh, instanced);
    const invalidate = useInvalidateMeshInstances();
    useLayoutEffect(() => invalidate(), [invalidate, properties.castShadow, properties.receiveShadow, properties.frustumCulled]);
    return <mesh
        ref={mesh}
        position={position}
        geometry={part.geometry}
        material={part.material}
        castShadow={properties.castShadow !== false}
        receiveShadow={properties.receiveShadow !== false}
        frustumCulled={properties.frustumCulled !== false}
    />;
}

function RepeatedModel({ source, positions, interactive, properties }: {
    source: Object3D;
    positions: [number, number, number][];
    interactive: boolean;
    properties: ModelProperties;
}) {
    const { isSelected } = useNode();
    const { id: runtimeNodeId } = useGameObject();
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
            });
        });
        return result;
    }, [source]);

    useEffect(() => () => {
        parts.forEach(part => part.geometry.dispose());
    }, [parts]);

    const instanced = properties.instanced !== false && properties.visible !== false && !interactive && !isSelected;
    return <group>
        {positions.map((position, instanceIndex) => parts.map((part, partIndex) => (
            <RepeatedMesh
                key={`${instanceIndex}:${partIndex}`}
                id={`${runtimeNodeId}:repeat:${instanceIndex}:${partIndex}`}
                part={part}
                position={position}
                instanced={instanced}
                properties={properties}
            />
        )))}
    </group>;
}

function LoadedModel({ properties }: ComponentViewProps<ModelProperties>) {
    const { basePath } = usePrefab();
    const { nodeInteractionHandlers } = useNode();
    const interactive = Boolean(nodeInteractionHandlers);
    const path = properties.filename ? withBasePath(basePath, properties.filename) : '';
    const sourceModel = useModelAsset(path);
    const positions = useMemo(() => getRepeatPositions(properties), [properties.repeat, properties.repeatAxes]);
    const model = sourceModel && (positions.length > 1 && canInstance(sourceModel)
        ? <RepeatedModel source={sourceModel} positions={positions} interactive={interactive} properties={properties} />
        : <ClonedModel source={sourceModel} properties={properties} />);
    return <group visible={properties.visible !== false}>{model}</group>;
}

function ModelComponentView(props: ComponentViewProps<ModelProperties>) {
    const store = usePrefabStoreApi();
    return <><AssetBoundary subscribeToRetry={store.subscribe}><LoadedModel {...props} /></AssetBoundary>{props.children}</>;
}

const ModelComponent: Component<ModelProperties> = {
    dependencies: properties => properties.filename ? [{ kind: 'model', path: properties.filename }] : [],
    name: 'Model',
    renderWhenDisabled: true,
    slot: 'object',
    View: ModelComponentView,
    properties: {
        ...meshProperties,
        instanced: { ...meshProperties.instanced, description: "Allow batching of compatible repeated model parts. Animated and skinned models remain separate." },
        filename: { type: 'string', default: '', description: 'Model asset path, relative to the prefab basePath, or an absolute URL.' },
        repeat: { type: 'boolean', default: false },
        repeatAxes: {
            type: 'array', default: [{ axis: 'x', count: 1, offset: 1 }],
            schema: { type: 'array', items: { type: 'object', properties: {
                axis: { type: 'string', enum: ['x', 'y', 'z'] },
                count: { type: 'integer', minimum: 1 }, offset: { type: 'number' },
            }, required: ['axis', 'count', 'offset'], additionalProperties: false } },
        },
    },
};

export default ModelComponent;
