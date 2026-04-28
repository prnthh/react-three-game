import { Component } from "./ComponentRegistry";
import { BooleanField, FieldGroup, NumberField, SelectField, StringField } from "./Input";

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

function getDefaultArgs(geometryType: string) {
    return (GEOMETRY_ARGS[geometryType]?.fields ?? []).map(field => field.defaultValue);
}

function GeometryComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    const geometryType = component.properties.geometryType ?? 'box';
    const schema = GEOMETRY_ARGS[geometryType] ?? GEOMETRY_ARGS.box;
    const args = component.properties.args ?? getDefaultArgs(geometryType);

    // Handle geometry type change to reset args
    const handleChange = (newValues: Record<string, any>) => {
        if ('geometryType' in newValues && newValues.geometryType !== geometryType) {
            onUpdate({ geometryType: newValues.geometryType, args: getDefaultArgs(newValues.geometryType) });
        } else {
            onUpdate(newValues);
        }
    };

    const updateArg = (index: number, value: number) => {
        const next = [...args];
        next[index] = value;
        onUpdate({ args: next });
    };

    return (
        <FieldGroup>
            <SelectField
                name="geometryType"
                label="Type"
                values={component.properties}
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
                    onChange={(next) => updateArg(index, next[field.name])}
                    fallback={field.defaultValue}
                    min={field.min}
                    step={field.step}
                />
            ))}
            <BooleanField
                name="visible"
                label="Visible"
                values={component.properties}
                onChange={handleChange}
                fallback={true}
            />
            <BooleanField
                name="castShadow"
                label="Cast Shadow"
                values={component.properties}
                onChange={handleChange}
                fallback={true}
            />
            <BooleanField
                name="receiveShadow"
                label="Receive Shadow"
                values={component.properties}
                onChange={handleChange}
                fallback={true}
            />
            <BooleanField
                name="emitClickEvent"
                label="Emit Click Event"
                values={component.properties}
                onChange={handleChange}
                fallback={false}
            />
            {component.properties.emitClickEvent ? (
                <StringField
                    name="clickEventName"
                    label="Click Event Name"
                    values={component.properties}
                    onChange={handleChange}
                    placeholder="cannon:fire"
                />
            ) : null}
        </FieldGroup>
    );
}


// View for Geometry component
function GeometryComponentView({ properties, children }: { properties: any, children?: React.ReactNode }) {
    const { geometryType, args = [] } = properties;
    // Only return the geometry node, do not wrap in mesh or group
    switch (geometryType) {
        case "box":
            return <boxGeometry args={args as [number, number, number]} />;
        case "sphere":
            return <sphereGeometry args={args as [number, number?, number?]} />;
        case "plane":
            return <planeGeometry args={args as [number, number]} />;
        case "cylinder":
            return <cylinderGeometry args={args as [number, number, number, number?]} />;
        default:
            return <boxGeometry args={[1, 1, 1]} />;
    }
}

const GeometryComponent: Component = {
    name: 'Geometry',
    disableSiblingComposition: 'geometry',
    Editor: GeometryComponentEditor,
    View: GeometryComponentView,
    defaultProperties: {
        geometryType: 'box',
        args: getDefaultArgs('box'),
        emitClickEvent: false,
        clickEventName: '',
    }
};

export default GeometryComponent;
