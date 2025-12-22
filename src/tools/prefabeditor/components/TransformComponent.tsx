
import { Component } from "./ComponentRegistry";

function TransformComponentEditor({ component, onUpdate, transformMode, setTransformMode }: {
    component: any;
    onUpdate: (newComp: any) => void;
    transformMode?: "translate" | "rotate" | "scale";
    setTransformMode?: (m: "translate" | "rotate" | "scale") => void;
}) {
    const s = {
        button: {
            padding: '2px 6px',
            background: 'transparent',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 4,
            cursor: 'pointer',
            font: 'inherit',
        },
        buttonActive: {
            background: 'rgba(255,255,255,0.10)',
        },
    };

    return <div className="flex flex-col">
        {transformMode && setTransformMode && (
            <div className="mb-2">
                <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-1">Transform Mode</label>
                <div style={{ display: 'flex', gap: 6 }}>
                    {["translate", "rotate", "scale"].map(mode => (
                        <button
                            key={mode}
                            onClick={() => setTransformMode(mode as any)}
                            style={{
                                ...s.button,
                                flex: 1,
                                ...(transformMode === mode ? s.buttonActive : {}),
                            }}
                            onPointerEnter={(e) => {
                                if (transformMode !== mode) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                            }}
                            onPointerLeave={(e) => {
                                if (transformMode !== mode) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>
        )}
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

    const axes = [
        { key: 'x', color: 'red', index: 0 },
        { key: 'y', color: 'green', index: 1 },
        { key: 'z', color: 'blue', index: 2 }
    ] as const;

    return <div className="mb-2">
        <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-1">{label}</label>
        <div className="flex gap-1">
            {axes.map(({ key, color, index }) => (
                <div key={key} className="flex-1 flex items-center gap-1 bg-black/30 border border-cyan-500/20 rounded px-1.5 py-1 min-h-[32px]">
                    <span className={`text-xs font-bold text-${color}-400 w-3`}>{key.toUpperCase()}</span>
                    <input
                        className="flex-1 bg-transparent text-xs text-cyan-200 font-mono outline-none w-full min-w-0"
                        type="number"
                        step="0.1"
                        value={value[index].toFixed(2)}
                        onChange={e => handleChange(index, e.target.value)}
                        onFocus={e => e.target.select()}
                    />
                </div>
            ))}
        </div>
    </div>
}