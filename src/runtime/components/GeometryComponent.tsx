import { usePrefabDocument } from '../prefabs/prefabApi.js';
import { MeshNode } from '../rendering/MeshNode.js';
import { meshProperties, type MeshProperties } from "../rendering/meshProperties.js";
import { ComponentLookupContext } from '../prefabs/nodePlan.js';
import { useGameObject, useNode } from "../scene/SceneContext.js";
import { notifyObjectChanged } from '../scene/objectChanges.js';
import type { GameObject } from "../../core/types.js";
import { useInvalidateMeshInstances } from "../rendering/MeshInstanceProvider.js";
import { getComponent, getComponentRegistryVersion, resolveComponentProperties, type Component, type ComponentViewProps } from "../../core/ComponentRegistry.js";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { Box3, Vector3, BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";

export const GEOMETRY_ARGS: Record<string, {
    create: (...args: number[]) => BufferGeometry;
    halfExtents: (...args: number[]) => Vector3;
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
        create: (...args) => new BoxGeometry(...args),
        halfExtents: (width = 1, height = 1, depth = 1) => new Vector3(Math.abs(width) / 2, Math.abs(height) / 2, Math.abs(depth) / 2),
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
        create: (...args) => new SphereGeometry(...args),
        halfExtents: (radius = 1) => new Vector3().setScalar(Math.abs(radius)),
        fields: [
            { name: 'radius', label: 'Radius', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'widthSegments', label: 'Width Segments', defaultValue: 32, min: 3, step: 1 },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 16, min: 2, step: 1 },
        ],
    },
    plane: {
        create: (...args) => new PlaneGeometry(...args),
        halfExtents: (width = 1, height = 1) => new Vector3(Math.abs(width) / 2, Math.abs(height) / 2, 0),
        fields: [
            { name: 'width', label: 'Width', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'widthSegments', label: 'Width Segments', defaultValue: 1, min: 1, step: 1, optional: true },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 1, min: 1, step: 1, optional: true },
        ],
    },
    cylinder: {
        create: (...args) => new CylinderGeometry(...args),
        halfExtents: (top = 1, bottom = 1, height = 1) => {
            const radius = Math.max(Math.abs(top), Math.abs(bottom));
            return new Vector3(radius, Math.abs(height) / 2, radius);
        },
        fields: [
            { name: 'radiusTop', label: 'Radius Top', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'radiusBottom', label: 'Radius Bottom', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'radialSegments', label: 'Radial Segments', defaultValue: 32, min: 3, step: 1 },
            { name: 'heightSegments', label: 'Height Segments', defaultValue: 1, min: 1, step: 1, optional: true },
        ],
    },
    torus: {
        create: (...args) => new TorusGeometry(...args),
        halfExtents: (radius = 1, tube = 0.4) => {
            const outer = Math.abs(radius) + Math.abs(tube);
            return new Vector3(outer, outer, Math.abs(tube));
        },
        fields: [
            { name: 'radius', label: 'Radius', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'tube', label: 'Tube', defaultValue: 0.4, min: 0.01, step: 0.05 },
            { name: 'radialSegments', label: 'Radial Segments', defaultValue: 12, min: 3, step: 1 },
            { name: 'tubularSegments', label: 'Tubular Segments', defaultValue: 24, min: 3, step: 1 },
        ],
    },
};

export const primitiveOptions = Object.keys(GEOMETRY_ARGS).map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));

export type GeometryProperties = MeshProperties & {
    geometryType?: string;
    args?: number[];
};

export function getDefaultArgs(geometryType: string) {
    return (GEOMETRY_ARGS[geometryType]?.fields ?? []).filter(field => !field.optional).map(field => field.defaultValue);
}

export function resolvePrimitive({ geometryType = 'box', args }: GeometryProperties) {
    const type = Object.hasOwn(GEOMETRY_ARGS, geometryType) ? geometryType : 'box';
    return { type, args: args?.length ? args : getDefaultArgs(type) };
}

/** Streaming only needs the conservative local bounds, before any buffers exist. */
export function primitiveBounds(properties: GeometryProperties) {
    const { type, args } = resolvePrimitive(properties);
    const extent = GEOMETRY_ARGS[type].halfExtents(...args);
    return new Box3(extent.clone().negate(), extent);
}

const SceneGeometryPoolContext = createContext<Map<string, BufferGeometry> | null>(null);

export function GeometryRuntimeProvider({ children }: { children: ReactNode }) {
    const [pool] = useState(() => new Map<string, BufferGeometry>());
    useEffect(() => () => pool.forEach(geometry => geometry.dispose()), [pool]);
    return <SceneGeometryPoolContext.Provider value={pool}>{children}</SceneGeometryPoolContext.Provider>;
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

const NO_GEOMETRY_MODIFIERS: ReturnType<typeof getGeometryModifiers> = [];

export function usePrimitiveGeometry(properties: GeometryProperties, modifiers = NO_GEOMETRY_MODIFIERS) {
    const { type, args } = resolvePrimitive(properties);
    const signature = JSON.stringify([type, args, modifiers.map(({ type, properties, context }) => [type, properties, context]), getComponentRegistryVersion()]);
    return useSharedGeometryResource(signature, () => {
        const source = GEOMETRY_ARGS[type].create(...args);
        let result: BufferGeometry | undefined;
        try { result = applyGeometryModifiers(source, modifiers); return result; }
        finally { if (result !== source) source.dispose(); }
    });
}

function GeometryComponentView({ properties, children }: ComponentViewProps<GeometryProperties>) {
    const nodeId = useNode(node => node.nodeId);
    const prefab = usePrefabDocument();
    const lookup = useContext(ComponentLookupContext);
    const geometry = usePrimitiveGeometry(properties, getGeometryModifiers(prefab.get(nodeId), lookup));
    const invalidateInstances = useInvalidateMeshInstances();
    const object = useGameObject();
    useLayoutEffect(() => {
        invalidateInstances();
        if (object.transform) notifyObjectChanged(object.transform, 'geometry');
    }, [geometry, invalidateInstances, object]);
    return <MeshNode properties={properties}>
        <primitive object={geometry} attach="geometry" dispose={null} />
        {children}
    </MeshNode>;
}

const GeometryComponent: Component<GeometryProperties> = {
    name: 'Geometry',
    category: 'mesh',
    renderWhenDisabled: true,
    description: "Add a primitive mesh; pair with Material on the same node. Box args are [width,height,depth].",
    slot: 'geometry', exclusive: 'geometry',
    View: GeometryComponentView,
    properties: {
        ...meshProperties,
        geometryType: {
            type: 'select',
            default: 'box',
            options: primitiveOptions,
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
