
import { Component } from "./ComponentRegistry";

function TransformComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <div className="flex flex-col">
        <Vector3Input label="Position" value={component.properties.position} onChange={v => onUpdate({ position: v })} />
        <Vector3Input label="Rotation" value={component.properties.rotation} onChange={v => onUpdate({ rotation: v })} />
        <Vector3Input label="Scale" value={component.properties.scale} onChange={v => onUpdate({ scale: v })} />
    </div>;
}

const TransformComponent: Component = {
    name: 'Transform',
    Editor: TransformComponentEditor,
    defaultProperties: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    }
};

export default TransformComponent;


export function Vector3Input({ label, value, onChange }: { label: string, value: [number, number, number], onChange: (v: [number, number, number]) => void }) {
    const handleChange = (index: number, val: string) => {
        const newValue = [...value] as [number, number, number];
        newValue[index] = parseFloat(val) || 0;
        onChange(newValue);
    };

    return <div className="mb-1">
        <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">{label}</label>
        <div className="flex gap-0.5">
            <div className="relative flex-1">
                <span className="absolute left-0.5 top-0 text-[8px] text-red-400/80 font-mono">X</span>
                <input className="w-full bg-black/40 border border-cyan-500/30 pl-3 pr-0.5 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50" type="number" step="0.1" value={value[0]} onChange={e => handleChange(0, e.target.value)} />
            </div>
            <div className="relative flex-1">
                <span className="absolute left-0.5 top-0 text-[8px] text-green-400/80 font-mono">Y</span>
                <input className="w-full bg-black/40 border border-cyan-500/30 pl-3 pr-0.5 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50" type="number" step="0.1" value={value[1]} onChange={e => handleChange(1, e.target.value)} />
            </div>
            <div className="relative flex-1">
                <span className="absolute left-0.5 top-0 text-[8px] text-blue-400/80 font-mono">Z</span>
                <input className="w-full bg-black/40 border border-cyan-500/30 pl-3 pr-0.5 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50" type="number" step="0.1" value={value[2]} onChange={e => handleChange(2, e.target.value)} />
            </div>
        </div>
    </div>
}