import { Component } from "./ComponentRegistry";
import { BooleanField, FieldGroup } from "./Input";

type NumericArray = number[];

interface BufferGeometryProperties {
    positions?: NumericArray;
    indices?: NumericArray;
    normals?: NumericArray;
    uvs?: NumericArray;
    computeVertexNormals?: boolean;
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
}

const DEFAULT_TRIANGLE_POSITIONS = [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
];

const DEFAULT_TRIANGLE_INDICES = [0, 1, 2];
const DEFAULT_TRIANGLE_UVS = [
    0, 0,
    1, 0,
    0, 1,
];

function isFiniteNumberArray(value: unknown): value is NumericArray {
    return Array.isArray(value) && value.every(entry => typeof entry === 'number' && Number.isFinite(entry));
}

function normalizeNumberArray(value: unknown, fallback: NumericArray) {
    return isFiniteNumberArray(value) ? value : fallback;
}

function toAttributeText(value: unknown, fallback: NumericArray) {
    return JSON.stringify(normalizeNumberArray(value, fallback));
}

function parseArrayInput(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const parsed = JSON.parse(trimmed);
    if (!isFiniteNumberArray(parsed)) {
        throw new Error('Expected a JSON array of numbers');
    }

    return parsed;
}

function getIndexArray(indices: NumericArray) {
    if (indices.length === 0) return null;
    const maxIndex = Math.max(...indices);
    return maxIndex > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
}

function BufferArrayField({
    label,
    value,
    fallback,
    onChange,
    rows = 4,
}: {
    label: string;
    value: unknown;
    fallback: NumericArray;
    onChange: (next: NumericArray) => void;
    rows?: number;
}) {
    return (
        <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                {label}
            </span>
            <textarea
                rows={rows}
                spellCheck={false}
                defaultValue={toAttributeText(value, fallback)}
                onBlur={(event) => {
                    try {
                        onChange(parseArrayInput(event.target.value));
                        event.target.setCustomValidity('');
                    } catch {
                        event.target.setCustomValidity('Expected a JSON array of numbers');
                        event.target.reportValidity();
                    }
                }}
                style={{
                    width: '100%',
                    backgroundColor: '#171717',
                    border: '1px solid #333',
                    padding: '6px 8px',
                    fontSize: '11px',
                    color: '#eee',
                    fontFamily: 'monospace',
                    outline: 'none',
                    borderRadius: 3,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                }}
            />
        </label>
    );
}

function BufferGeometryComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    const properties = component.properties ?? {};

    return (
        <FieldGroup>
            <BufferArrayField
                label="Positions"
                value={properties.positions}
                fallback={DEFAULT_TRIANGLE_POSITIONS}
                rows={5}
                onChange={(positions) => onUpdate({ positions })}
            />
            <BufferArrayField
                label="Indices"
                value={properties.indices}
                fallback={DEFAULT_TRIANGLE_INDICES}
                onChange={(indices) => onUpdate({ indices })}
            />
            <BufferArrayField
                label="Normals"
                value={properties.normals}
                fallback={[]}
                onChange={(normals) => onUpdate({ normals })}
            />
            <BufferArrayField
                label="UVs"
                value={properties.uvs}
                fallback={DEFAULT_TRIANGLE_UVS}
                onChange={(uvs) => onUpdate({ uvs })}
            />
            <BooleanField
                name="computeVertexNormals"
                label="Compute Normals"
                values={properties}
                onChange={onUpdate}
                fallback={true}
            />
            <BooleanField
                name="visible"
                label="Visible"
                values={properties}
                onChange={onUpdate}
                fallback={true}
            />
            <BooleanField
                name="castShadow"
                label="Cast Shadow"
                values={properties}
                onChange={onUpdate}
                fallback={true}
            />
            <BooleanField
                name="receiveShadow"
                label="Receive Shadow"
                values={properties}
                onChange={onUpdate}
                fallback={true}
            />
        </FieldGroup>
    );
}

function BufferGeometryComponentView({ properties }: { properties: BufferGeometryProperties }) {
    const positions = normalizeNumberArray(properties.positions, DEFAULT_TRIANGLE_POSITIONS);
    const indices = normalizeNumberArray(properties.indices, DEFAULT_TRIANGLE_INDICES);
    const normals = normalizeNumberArray(properties.normals, []);
    const uvs = normalizeNumberArray(properties.uvs, DEFAULT_TRIANGLE_UVS);
    const indexArray = getIndexArray(indices);
    const hasNormals = normals.length >= 3 && normals.length % 3 === 0;
    const hasUvs = uvs.length >= 2 && uvs.length % 2 === 0;

    return (
        <bufferGeometry onUpdate={(geometry) => {
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
    );
}

const BufferGeometryComponent: Component = {
    name: 'BufferGeometry',
    Editor: BufferGeometryComponentEditor,
    View: BufferGeometryComponentView,
    defaultProperties: {
        positions: DEFAULT_TRIANGLE_POSITIONS,
        indices: DEFAULT_TRIANGLE_INDICES,
        normals: [],
        uvs: DEFAULT_TRIANGLE_UVS,
        computeVertexNormals: true,
    },
};

export default BufferGeometryComponent;