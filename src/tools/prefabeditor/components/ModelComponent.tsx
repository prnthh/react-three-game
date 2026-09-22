import { Suspense, useEffect, useMemo, useState } from 'react';

import { Matrix4, Mesh, SkinnedMesh, type BufferGeometry, type Material, type Object3D } from 'three';

import type { Component, ComponentViewProps } from './ComponentRegistry';

import { useSuspenseModelAsset } from '../assetRuntime';

import { useNode } from '../SceneContext';

import { withBasePath } from '../runtimeUtils';

import { usePrefab } from '../SceneContext';

import { useMeshInstanceRegistration } from '../MeshInstanceProvider';

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

export type ModelProperties = {
    filename?: string;
    emitClickEvent?: boolean;
    clickEventName?: string;
    repeat?: boolean;
    repeatAxes?: RepeatAxisConfig[];
};

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
    dependencies: properties => properties.filename ? [{ kind: 'model', path: properties.filename }] : [],
    name: 'Model',
    renderWhenDisabled: true,
    slot: 'object',
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
