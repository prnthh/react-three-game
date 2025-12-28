import { Component } from "./ComponentRegistry";
import { Input, Label } from "./Input";

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

    const selectStyle = {
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
                <Label>Type</Label>
                <select style={selectStyle} value={geometryType} onChange={e => {
                    const type = e.target.value;
                    onUpdate({ geometryType: type, args: GEOMETRY_ARGS[type].defaults });
                }}>
                    <option value="box">Box</option>
                    <option value="sphere">Sphere</option>
                    <option value="plane">Plane</option>
                </select>
            </div>

            {schema.labels.map((label, i) => (
                <div key={label}>
                    <Label>{label}</Label>
                    <Input
                        value={args[i] ?? schema.defaults[i]}
                        step="0.1"
                        onChange={value => {
                            const next = [...args];
                            next[i] = value;
                            onUpdate({ args: next });
                        }}
                    />
                </div>
            ))}
        </div>
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