import { Component } from "./ComponentRegistry";

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

    return (
        <div className="flex flex-col gap-1">
            {/* Geometry Type */}
            <label className="label">Type</label>
            <select
                className="select"
                value={geometryType}
                onChange={e => {
                    const type = e.target.value;
                    onUpdate({
                        geometryType: type,
                        args: GEOMETRY_ARGS[type].defaults,
                    });
                }}
            >
                <option value="box">Box</option>
                <option value="sphere">Sphere</option>
                <option value="plane">Plane</option>
            </select>

            {/* Args */}
            {schema.labels.map((label, i) => (
                <div key={label}>
                    <label className="label">{label}</label>
                    <input
                        type="number"
                        className="input"
                        value={args[i] ?? schema.defaults[i]}
                        step="0.1"
                        onChange={e => {
                            const next = [...args];
                            next[i] = parseFloat(e.target.value);
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