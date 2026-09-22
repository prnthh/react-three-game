import type { Component, ComponentViewProps } from "./ComponentRegistry";

export type NumericArray = number[];

export type GeometryGroup = { start: number; count: number; materialIndex?: number };

export interface BufferGeometryProperties {
    positions?: NumericArray;
    indices?: NumericArray;
    normals?: NumericArray;
    uvs?: NumericArray;
    groups?: GeometryGroup[];
    computeVertexNormals?: boolean;
}

export const DEFAULT_TRIANGLE_POSITIONS = [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
];

export const DEFAULT_TRIANGLE_INDICES = [0, 1, 2];

export const DEFAULT_TRIANGLE_UVS = [
    0, 0,
    1, 0,
    0, 1,
];

export function isFiniteNumberArray(value: unknown): value is NumericArray {
    return Array.isArray(value) && value.every(entry => typeof entry === 'number' && Number.isFinite(entry));
}

function isGeometryGroupArray(value: unknown): value is GeometryGroup[] {
    return Array.isArray(value) && value.every(group => {
        if (!group || typeof group !== 'object' || Array.isArray(group)) return false;
        const entry = group as Record<string, unknown>;
        return typeof entry.start === 'number'
            && Number.isFinite(entry.start)
            && typeof entry.count === 'number'
            && Number.isFinite(entry.count)
            && (entry.materialIndex === undefined || typeof entry.materialIndex === 'number');
    });
}

export function normalizeNumberArray(value: unknown, fallback: NumericArray) {
    return isFiniteNumberArray(value) ? value : fallback;
}

function getIndexArray(indices: NumericArray) {
    if (indices.length === 0) return null;
    const maxIndex = Math.max(...indices);
    return maxIndex > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
}

function BufferGeometryComponentView({ properties, children }: ComponentViewProps<BufferGeometryProperties>) {
    const positions = normalizeNumberArray(properties.positions, DEFAULT_TRIANGLE_POSITIONS);
    const indices = normalizeNumberArray(properties.indices, DEFAULT_TRIANGLE_INDICES);
    const normals = normalizeNumberArray(properties.normals, []);
    const uvs = normalizeNumberArray(properties.uvs, DEFAULT_TRIANGLE_UVS);
    const indexArray = getIndexArray(indices);
    const hasNormals = normals.length >= 3 && normals.length % 3 === 0;
    const hasUvs = uvs.length >= 2 && uvs.length % 2 === 0;
    const groups = isGeometryGroupArray(properties.groups) ? properties.groups : [];

    return <>
        <bufferGeometry onUpdate={(geometry) => {
            geometry.clearGroups();
            groups.forEach(group => {
                geometry.addGroup(group.start, group.count, group.materialIndex ?? 0);
            });
            if (properties.computeVertexNormals !== false && !hasNormals) {
                geometry.computeVertexNormals();
            }
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        }}>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(positions), 3]} />
            {indexArray ? (
                <bufferAttribute attach="index" args={[indexArray, 1]} />
            ) : null}
            {hasNormals ? (
                <bufferAttribute attach="attributes-normal" args={[new Float32Array(normals), 3]} />
            ) : null}
            {hasUvs ? (
                <bufferAttribute attach="attributes-uv" args={[new Float32Array(uvs), 2]} />
            ) : null}
        </bufferGeometry>
        {children}
    </>;
}

const BufferGeometryComponent: Component<BufferGeometryProperties> = {
    name: 'BufferGeometry',
    renderWhenDisabled: true,
    slot: 'geometry',
    View: BufferGeometryComponentView,
    properties: {
        positions: { type: 'number[]', default: DEFAULT_TRIANGLE_POSITIONS },
        indices: { type: 'number[]', default: DEFAULT_TRIANGLE_INDICES },
        normals: { type: 'number[]', default: [] },
        uvs: { type: 'number[]', default: DEFAULT_TRIANGLE_UVS },
        groups: { type: 'array', default: [] },
        computeVertexNormals: { type: 'boolean', default: true },
    },
};

export default BufferGeometryComponent;
