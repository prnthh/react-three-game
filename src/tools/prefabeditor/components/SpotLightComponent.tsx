
import { Component } from "./ComponentRegistry";
import { useRef } from "react";

function SpotLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    // Provide default values to prevent NaN
    const props = {
        color: component.properties.color ?? '#ffffff',
        intensity: component.properties.intensity ?? 1.0,
        angle: component.properties.angle ?? Math.PI / 6,
        penumbra: component.properties.penumbra ?? 0.5,
        distance: component.properties.distance ?? 100,
        castShadow: component.properties.castShadow ?? true
    };

    return <div className="flex flex-col gap-2">
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Color</label>
            <div className="flex gap-0.5">
                <input
                    type="color"
                    className="h-5 w-5 bg-transparent border-none cursor-pointer"
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, 'color': e.target.value })}
                />
                <input
                    type="text"
                    className="flex-1 bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, 'color': e.target.value })}
                />
            </div>
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Intensity</label>
            <input
                type="number"
                step="0.1"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.intensity}
                onChange={e => onUpdate({ ...component.properties, 'intensity': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Angle</label>
            <input
                type="number"
                step="0.1"
                min="0"
                max={Math.PI}
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.angle}
                onChange={e => onUpdate({ ...component.properties, 'angle': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Penumbra</label>
            <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.penumbra}
                onChange={e => onUpdate({ ...component.properties, 'penumbra': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Distance</label>
            <input
                type="number"
                step="1"
                min="0"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.distance}
                onChange={e => onUpdate({ ...component.properties, 'distance': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Cast Shadow</label>
            <input
                type="checkbox"
                className="h-4 w-4 bg-black/40 border border-cyan-500/30 cursor-pointer"
                checked={props.castShadow}
                onChange={e => onUpdate({ ...component.properties, 'castShadow': e.target.checked })}
            />
        </div>
    </div>;
}


// The view component for SpotLight
function SpotLightView({ properties }: { properties: any }) {
    // Provide defaults in case properties are missing
    const color = properties.color ?? '#ffffff';
    const intensity = properties.intensity ?? 1.0;
    const angle = properties.angle ?? Math.PI / 6;
    const penumbra = properties.penumbra ?? 0.5;
    const distance = properties.distance ?? 100;
    const castShadow = properties.castShadow ?? true;

    return (
        <>
            <spotLight
                color={color}
                intensity={intensity}
                angle={angle}
                penumbra={penumbra}
                distance={distance}
                castShadow={castShadow}
            />
        </>
    );
}

const SpotLightComponent: Component = {
    name: 'SpotLight',
    Editor: SpotLightComponentEditor,
    View: SpotLightView,
    defaultProperties: {}
};

export default SpotLightComponent;
