import { Component } from "./ComponentRegistry";

function GeometryComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <div>
        <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Type</label>
        <select
            className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
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