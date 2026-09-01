import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { useLayoutEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from "three";
import { FieldGroup, NumberField, SelectField } from "./Input";

const GEOMETRY_ARGS: Record<string, {
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

type GeometryProperties = {
    geometryType?: string;
    args?: number[];
};

function getDefaultArgs(geometryType: string) {
    return (GEOMETRY_ARGS[geometryType]?.fields ?? []).map(field => field.defaultValue);
}

const GEOMETRY_ELEMENTS = {
    box: 'boxGeometry', sphere: 'sphereGeometry', plane: 'planeGeometry',
    cylinder: 'cylinderGeometry', torus: 'torusGeometry',
} as const;

type SharedGeometryEntry = { geometry: BufferGeometry; references: number };
const sharedGeometries = new Map<string, SharedGeometryEntry>();

function createGeometry(type: keyof typeof GEOMETRY_ELEMENTS, args: number[]) {
    if (type === 'sphere') return new SphereGeometry(args[0], args[1], args[2]);
    if (type === 'plane') return new PlaneGeometry(args[0], args[1]);
    if (type === 'cylinder') return new CylinderGeometry(args[0], args[1], args[2], args[3]);
    if (type === 'torus') return new TorusGeometry(args[0], args[1], args[2], args[3]);
    return new BoxGeometry(args[0], args[1], args[2]);
}

function useSharedGeometry(type: keyof typeof GEOMETRY_ELEMENTS, args: number[]) {
    const signature = `${type}:${JSON.stringify(args)}`;
    const entry = useMemo(() => {
        const existing = sharedGeometries.get(signature);
        if (existing) return existing;
        const geometry = createGeometry(type, args);
        geometry.userData.prefabGeometrySignature = signature;
        const created = { geometry, references: 0 };
        sharedGeometries.set(signature, created);
        return created;
    }, [signature, type]);

    useLayoutEffect(() => {
        entry.references += 1;
        return () => {
            entry.references -= 1;
            queueMicrotask(() => {
                if (entry.references > 0 || sharedGeometries.get(signature) !== entry) return;
                sharedGeometries.delete(signature);
                entry.geometry.dispose();
            });
        };
    }, [entry, signature]);
    return entry.geometry;
}

function GeometryComponentEditor({ properties, update }: ComponentEditorProps<GeometryProperties>) {
    const geometryType = properties.geometryType ?? 'box';
    const schema = GEOMETRY_ARGS[geometryType] ?? GEOMETRY_ARGS.box;
    const args = properties.args ?? getDefaultArgs(geometryType);

    // Handle geometry type change to reset args
    const handleChange = (newValues: Partial<GeometryProperties>) => {
        if (typeof newValues.geometryType === 'string' && newValues.geometryType !== geometryType) {
            update({ geometryType: newValues.geometryType, args: getDefaultArgs(newValues.geometryType) });
        } else {
            update(newValues);
        }
    };

    const updateArg = (index: number, value: number) => {
        const next = [...args];
        next[index] = value;
        update({ args: next });
    };

    return (
        <FieldGroup>
            <SelectField
                name="geometryType"
                label="Type"
                values={properties}
                onChange={handleChange}
                options={[
                    { value: 'box', label: 'Box' },
                    { value: 'sphere', label: 'Sphere' },
                    { value: 'plane', label: 'Plane' },
                    { value: 'cylinder', label: 'Cylinder' },
                    { value: 'torus', label: 'Torus' },
                ]}
            />
            {schema.fields.map((field, index) => (
                <NumberField
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    values={{ [field.name]: args[index] ?? field.defaultValue }}
                    onChange={(next) => updateArg(index, next[field.name] ?? field.defaultValue)}
                    fallback={field.defaultValue}
                    min={field.min}
                    step={field.step}
                />
            ))}
        </FieldGroup>
    );
}


// View for Geometry component
function GeometryComponentView({ properties, children }: ComponentViewProps<GeometryProperties>) {
    const { geometryType, args = [] } = properties;
    const type = geometryType && geometryType in GEOMETRY_ELEMENTS ? geometryType as keyof typeof GEOMETRY_ELEMENTS : 'box';
    const resolvedArgs = args.length ? args : getDefaultArgs(type);
    const geometry = useSharedGeometry(type, resolvedArgs);
    return <><primitive object={geometry} attach="geometry" dispose={null} />{children}</>;
}

const GeometryComponent: Component<GeometryProperties> = {
    name: 'Geometry',
    renderWhenDisabled: true,
    attachment: true,
    attach: 'geometry',
    Editor: GeometryComponentEditor,
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
