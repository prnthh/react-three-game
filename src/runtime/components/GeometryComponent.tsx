import { meshProperties, type MeshProperties } from "../rendering/meshProperties.js";
import { ComponentLookupContext } from '../prefabs/nodePlan.js';
import { useGameObject, useNode, usePrefab } from "../scene/SceneContext.js";
import { notifyObjectChanged } from '../scene/objectChanges.js';
import type { GameObject } from "../../core/types.js";
import { useInvalidateMeshInstances } from "../rendering/MeshInstanceProvider.js";
import { getComponent, getComponentRegistryVersion, resolveComponentProperties, type Component, type ComponentViewProps } from "../../core/ComponentRegistry.js";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";

export const GEOMETRY_ARGS: Record<string, {
    fields: Array<{
        name: string;
        label: string;
        defaultValue: number;
        min?: number;
        step?: number;
        optional?: boolean;
    }>;
}> = {
    box: {
        fields: [
            { name: 'width', label: 'Width', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'depth', label: 'Depth', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'widthSegments', label: 'Width Segments', defaultValue: 1, min: 1, step: 1, optional: true },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 1, min: 1, step: 1, optional: true },
            { name: 'depthSegments', label: 'Depth Segments', defaultValue: 1, min: 1, step: 1, optional: true },
        ],
    },
    sphere: {
        fields: [
            { name: 'radius', label: 'Radius', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'widthSegments', label: 'Width Segments', defaultValue: 32, min: 3, step: 1 },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 16, min: 2, step: 1 },
        ],
    },
    plane: {
        fields: [
            { name: 'width', label: 'Width', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'widthSegments', label: 'Width Segments', defaultValue: 1, min: 1, step: 1, optional: true },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 1, min: 1, step: 1, optional: true },
        ],
    },
    cylinder: {
        fields: [
            { name: 'radiusTop', label: 'Radius Top', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'radiusBottom', label: 'Radius Bottom', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'radialSegments', label: 'Radial Segments', defaultValue: 32, min: 3, step: 1 },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 1, min: 1, step: 1, optional: true },
        ],
    },
    torus: {
        fields: [
            { name: 'radius', label: 'Radius', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'tube', label: 'Tube', defaultValue: 0.4, min: 0.01, step: 0.05 },
            { name: 'radialSegments', label: 'Radial Segments', defaultValue: 12, min: 3, step: 1 },
            { name: 'tubularSegments', label: 'Tubular Segments', defaultValue: 24, min: 3, step: 1 },
        ],
    },
};

export type GeometryProperties = MeshProperties & {
    geometryType?: string;
    args?: number[];
};

export function getDefaultArgs(geometryType: string) {
    return (GEOMETRY_ARGS[geometryType]?.fields ?? []).filter(field => !field.optional).map(field => field.defaultValue);
}

const GEOMETRY_ELEMENTS = {
    box: 'boxGeometry', sphere: 'sphereGeometry', plane: 'planeGeometry',
    cylinder: 'cylinderGeometry', torus: 'torusGeometry',
} as const;

const SceneGeometryPoolContext = createContext<Map<string, BufferGeometry> | null>(null);

export function GeometryRuntimeProvider({ children }: { children: ReactNode }) {
    const pool = useContext(SceneGeometryPoolContext);
    if (pool) return children;
    return <SceneGeometryPoolOwner>{children}</SceneGeometryPoolOwner>;
}

function SceneGeometryPoolOwner({ children }: { children: ReactNode }) {
    const [pool] = useState(() => new Map<string, BufferGeometry>());
    useEffect(() => () => pool.forEach(geometry => geometry.dispose()), [pool]);
    return <SceneGeometryPoolContext.Provider value={pool}>{children}</SceneGeometryPoolContext.Provider>;
}

function createGeometry(type: keyof typeof GEOMETRY_ELEMENTS, args: number[]) {
    if (type === 'sphere') return new SphereGeometry(...args);
    if (type === 'plane') return new PlaneGeometry(...args);
    if (type === 'cylinder') return new CylinderGeometry(...args);
    if (type === 'torus') return new TorusGeometry(...args);
    return new BoxGeometry(...args);
}

/** Immutable custom geometry is shared across instances by its complete authoring key. */
export function useSharedGeometryResource<T extends BufferGeometry>(key: string, create: () => T): T {
    const pool = useContext(SceneGeometryPoolContext);
    if (!pool) throw new Error('Shared geometry requires a scene geometry pool');
    return useMemo(() => {
        const signature = `custom:${key}`;
        const existing = pool.get(signature);
        if (existing) return existing as T;
        const geometry = create();
        geometry.userData.prefabGeometrySignature = signature;
        pool.set(signature, geometry);
        return geometry;
    }, [pool, key]);
}

/** Resolve only this node's modifiers, independently of View nesting or component keys. */
export function getGeometryModifiers(node: GameObject | null, lookup = getComponent) {
    const transform = Object.values(node?.components ?? {}).find(data => data?.type === 'Transform');
    const context = { scale: (transform?.properties?.scale ?? [1, 1, 1]) as [number, number, number] };
    return Object.values(node?.components ?? {}).flatMap(data => {
        if (!data) return [];
        const definition = lookup(data.type);
        if (!definition?.modifyGeometry) return [];
        return [{ type: data.type, modify: definition.modifyGeometry,
            properties: resolveComponentProperties(definition, data.properties), context }];
    });
}

export function applyGeometryModifiers(source: BufferGeometry, modifiers: ReturnType<typeof getGeometryModifiers>) {
    let result = source;
    try {
        for (const modifier of modifiers) {
            const next = modifier.modify(result, modifier.properties, modifier.context);
            if (result !== source && result !== next) result.dispose();
            result = next;
        }
        return result;
    } catch (error) {
        if (result !== source) result.dispose();
        throw error;
    }
}

function GeometryComponentView({ properties, children }: ComponentViewProps<GeometryProperties>) {
    const { geometryType, args = [] } = properties;
    const type = geometryType && geometryType in GEOMETRY_ELEMENTS ? geometryType as keyof typeof GEOMETRY_ELEMENTS : 'box';
    const resolvedArgs = args.length ? args : getDefaultArgs(type);
    const { nodeId } = useNode();
    const prefab = usePrefab();
    const lookup = useContext(ComponentLookupContext);
    const modifiers = getGeometryModifiers(prefab.get(nodeId), lookup);
    const signature = JSON.stringify([type, resolvedArgs, modifiers.map(({ type, properties, context }) => [type, properties, context]), getComponentRegistryVersion()]);
    const geometry = useSharedGeometryResource(signature, () => {
        const source = createGeometry(type, resolvedArgs);
        let result: BufferGeometry | undefined;
        try { result = applyGeometryModifiers(source, modifiers); return result; }
        finally { if (result !== source) source.dispose(); }
    });
    const invalidateInstances = useInvalidateMeshInstances();
    const object = useGameObject();
    useLayoutEffect(() => {
        invalidateInstances();
        if (object.transform) notifyObjectChanged(object.transform, 'geometry');
    }, [geometry, invalidateInstances, object]);
    return <><primitive object={geometry} attach="geometry" dispose={null} />{children}</>;
}

const GeometryComponent: Component<GeometryProperties> = {
    name: 'Geometry',
    description: "Add a primitive mesh; pair with Material on the same node. Box args are [width,height,depth].",
    renderWhenDisabled: true,
    slot: 'geometry',
    View: GeometryComponentView,
    properties: {
        ...meshProperties,
        geometryType: {
            type: 'select',
            default: 'box',
            options: [
                { value: 'box', label: 'Box' },
                { value: 'sphere', label: 'Sphere' },
                { value: 'plane', label: 'Plane' },
                { value: 'cylinder', label: 'Cylinder' },
                { value: 'torus', label: 'Torus' },
            ],
        },
        args: {
            type: 'number[]',
            description: 'Ordered geometry constructor arguments. Meanings depend on geometryType.',
            schema: properties => {
                const fields = GEOMETRY_ARGS[properties.geometryType ?? 'box']?.fields ?? [];
                return {
                    type: 'array',
                    prefixItems: fields.map(field => ({ type: 'number', title: field.name, description: field.label, default: field.defaultValue, minimum: field.min })),
                    minItems: fields.filter(field => !field.optional).length,
                    maxItems: fields.length,
                };
            },
            default: properties => getDefaultArgs(properties.geometryType ?? 'box'),
        },
    }
};

export default GeometryComponent;
