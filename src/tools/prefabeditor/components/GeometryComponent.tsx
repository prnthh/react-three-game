import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { useNode } from "../SceneContext";
import { FieldGroup, NumberField, SelectField } from "./Input";
import { scheduleGeometryRaycast } from "../../../shared/raycast";

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
};

type GeometryProperties = {
    geometryType?: string;
    args?: number[];
};

function getDefaultArgs(geometryType: string) {
    return (GEOMETRY_ARGS[geometryType]?.fields ?? []).map(field => field.defaultValue);
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
    const { editMode, nodeInteractionHandlers } = useNode();
    const { geometryType, args = [] } = properties;
    const geometryKey = `${geometryType ?? 'box'}:${JSON.stringify(args)}`;
    const onGeometryUpdate = editMode || nodeInteractionHandlers
        ? scheduleGeometryRaycast
        : undefined;

    let geometry: React.ReactNode;
    switch (geometryType) {
        case "box":
            geometry = <boxGeometry key={geometryKey} args={args as [number, number, number]} onUpdate={onGeometryUpdate} />;
            break;
        case "sphere":
            geometry = <sphereGeometry key={geometryKey} args={args as [number, number?, number?]} onUpdate={onGeometryUpdate} />;
            break;
        case "plane":
            geometry = <planeGeometry key={geometryKey} args={args as [number, number]} onUpdate={onGeometryUpdate} />;
            break;
        case "cylinder":
            geometry = <cylinderGeometry key={geometryKey} args={args as [number, number, number, number?]} onUpdate={onGeometryUpdate} />;
            break;
        default:
            geometry = <boxGeometry key="box:[1,1,1]" args={[1, 1, 1]} onUpdate={onGeometryUpdate} />;
    }

    return <>{geometry}{children}</>;
}

const GeometryComponent: Component<GeometryProperties> = {
    name: 'Geometry',
    attachment: true,
    disableSiblingComposition: 'geometry',
    Editor: GeometryComponentEditor,
    View: GeometryComponentView,
    defaultProperties: {
        geometryType: 'box',
        args: getDefaultArgs('box'),
    }
};

export default GeometryComponent;
