import { useInvalidateMeshInstances } from "../MeshInstanceProvider";
import type { Component, ComponentViewProps } from "./ComponentRegistry";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";

export const GEOMETRY_ARGS: Record<string, {
    fields: Array<{
        name: string;
        label: string;
        defaultValue: number;
        min?: number;
        step?: number;
    }>;
}> = {
    box: {
        fields: [
            { name: 'width', label: 'Width', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'depth', label: 'Depth', defaultValue: 1, min: 0.01, step: 0.1 },
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
        ],
    },
    cylinder: {
        fields: [
            { name: 'radiusTop', label: 'Radius Top', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'radiusBottom', label: 'Radius Bottom', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'height', label: 'Height', defaultValue: 1, min: 0.01, step: 0.1 },
            { name: 'radialSegments', label: 'Radial Segments', defaultValue: 32, min: 3, step: 1 },
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

export type GeometryProperties = {
    geometryType?: string;
    args?: number[];
};

export function getDefaultArgs(geometryType: string) {
    return (GEOMETRY_ARGS[geometryType]?.fields ?? []).map(field => field.defaultValue);
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
    if (type === 'sphere') return new SphereGeometry(args[0], args[1], args[2]);
    if (type === 'plane') return new PlaneGeometry(args[0], args[1]);
    if (type === 'cylinder') return new CylinderGeometry(args[0], args[1], args[2], args[3]);
    if (type === 'torus') return new TorusGeometry(args[0], args[1], args[2], args[3]);
    return new BoxGeometry(args[0], args[1], args[2]);
}

function useSharedGeometry(type: keyof typeof GEOMETRY_ELEMENTS, args: number[]) {
    const pool = useContext(SceneGeometryPoolContext)!;
    const signature = `${type}:${JSON.stringify(args)}`;
    return useMemo(() => {
        const existing = pool.get(signature);
        if (existing) return existing;
        const geometry = createGeometry(type, args);
        geometry.userData.prefabGeometrySignature = signature;
        pool.set(signature, geometry);
        return geometry;
    }, [pool, signature, type]);
}

function GeometryComponentView({ properties, children }: ComponentViewProps<GeometryProperties>) {
    const { geometryType, args = [] } = properties;
    const type = geometryType && geometryType in GEOMETRY_ELEMENTS ? geometryType as keyof typeof GEOMETRY_ELEMENTS : 'box';
    const resolvedArgs = args.length ? args : getDefaultArgs(type);
    const geometry = useSharedGeometry(type, resolvedArgs);
    const invalidateInstances = useInvalidateMeshInstances();
    useLayoutEffect(invalidateInstances, [geometry, invalidateInstances]);
    return <><primitive object={geometry} attach="geometry" dispose={null} />{children}</>;
}

const GeometryComponent: Component<GeometryProperties> = {
    name: 'Geometry',
    renderWhenDisabled: true,
    slot: 'geometry',
    View: GeometryComponentView,
    properties: {
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
            default: properties => getDefaultArgs(properties.geometryType ?? 'box'),
        },
    }
};

export default GeometryComponent;
