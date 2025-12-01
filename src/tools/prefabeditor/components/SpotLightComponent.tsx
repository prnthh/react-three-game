
import { Component } from "./ComponentRegistry";

function SpotLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <div className="flex flex-col">
        <div className="mb-1">
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Color</label>
            <div className="flex gap-0.5">
                <input
                    type="color"
                    className="h-5 w-5 bg-transparent border-none cursor-pointer"
                    value={component.properties.color}
                    onChange={e => onUpdate({ 'color': e.target.value })}
                />
                <input
                    type="text"
                    className="flex-1 bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                    value={component.properties.color}
                    onChange={e => onUpdate({ 'color': e.target.value })}
                />
            </div>
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Intensity</label>
            <input
                type="number"
                step="0.1"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={component.properties.intensity}
                onChange={e => onUpdate({ 'intensity': parseFloat(e.target.value) })}
            />
        </div>
    </div>;
}


// The view component for SpotLight
function SpotLightView({ properties }: { properties: any }) {
    // You can expand this with more spotlight properties as needed
    return <spotLight color={properties.color} intensity={properties.intensity} />;
}

const SpotLightComponent: Component = {
    name: 'SpotLight',
    Editor: SpotLightComponentEditor,
    View: SpotLightView,
    defaultProperties: {
        color: '#ffffff',
        intensity: 1.0
    }
};

export default SpotLightComponent;
