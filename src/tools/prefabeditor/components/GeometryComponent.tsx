import { Component } from "./ComponentRegistry";

function GeometryComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <div>
        <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Type</label>
        <select
            style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
            value={component.properties.geometryType}
            onChange={e => onUpdate({ geometryType: e.target.value })}
        >
            <option value="box">Box</option>
            <option value="sphere">Sphere</option>
            <option value="plane">Plane</option>
        </select>
    </div>;
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
        geometryType: 'box'
    }
};

export default GeometryComponent;