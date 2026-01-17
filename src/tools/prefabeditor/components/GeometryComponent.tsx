import { Component } from "./ComponentRegistry";
import { FieldRenderer, FieldDefinition, Input, Label } from "./Input";

const GEOMETRY_ARGS: Record<string, {
    labels: string[];
    defaults: number[];
}> = {
    box: {
        labels: ["Width", "Height", "Depth"],
        defaults: [1, 1, 1],
    },
    sphere: {
        labels: ["Radius", "Width Segments", "Height Segments"],
        defaults: [1, 32, 16],
    },
    plane: {
        labels: ["Width", "Height"],
        defaults: [1, 1],
    },
};

function GeometryComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    const { geometryType, args = [] } = component.properties;
    const schema = GEOMETRY_ARGS[geometryType];

    const fields: FieldDefinition[] = [
        {
            name: 'geometryType',
            type: 'select',
            label: 'Type',
            options: [
                { value: 'box', label: 'Box' },
                { value: 'sphere', label: 'Sphere' },
                { value: 'plane', label: 'Plane' },
            ],
        },
        {
            name: 'args',
            type: 'custom',
            label: '',
            render: ({ values, onChangeMultiple }) => {
                const currentType = values.geometryType;
                const currentSchema = GEOMETRY_ARGS[currentType];
                const currentArgs = values.args || currentSchema.defaults;

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {currentSchema.labels.map((label, i) => (
                            <div key={label}>
                                <Label>{label}</Label>
                                <Input
                                    value={currentArgs[i] ?? currentSchema.defaults[i]}
                                    step={0.1}
                                    onChange={value => {
                                        const next = [...currentArgs];
                                        next[i] = value;
                                        onChangeMultiple({ args: next });
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                );
            },
        },
    ];

    // Handle geometry type change to reset args
    const handleChange = (newValues: Record<string, any>) => {
        if ('geometryType' in newValues && newValues.geometryType !== geometryType) {
            onUpdate({ geometryType: newValues.geometryType, args: GEOMETRY_ARGS[newValues.geometryType].defaults });
        } else {
            onUpdate(newValues);
        }
    };

    return (
        <FieldRenderer
            fields={fields}
            values={component.properties}
            onChange={handleChange}
        />
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
        default:
            return <boxGeometry args={[1, 1, 1]} />;
    }
}

const GeometryComponent: Component = {
    name: 'Geometry',
    Editor: GeometryComponentEditor,
    View: GeometryComponentView,
    defaultProperties: {
        geometryType: 'box',
        args: GEOMETRY_ARGS.box.defaults,
    }
};

export default GeometryComponent;