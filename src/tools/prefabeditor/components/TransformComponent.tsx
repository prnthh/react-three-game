import { Component } from "./ComponentRegistry";
import { Vector3Input, Label } from "./Input";

const buttonStyle = {
    padding: '2px 6px',
    background: 'transparent',
    color: 'rgba(255,255,255,0.9)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 4,
    cursor: 'pointer',
    font: 'inherit',
    flex: 1,
};

function TransformComponentEditor({ component, onUpdate, transformMode, setTransformMode }: {
    component: any;
    onUpdate: (newComp: any) => void;
    transformMode?: "translate" | "rotate" | "scale";
    setTransformMode?: (m: "translate" | "rotate" | "scale") => void;
}) {
    return <div style={{ display: 'flex', flexDirection: 'column' }}>
        {transformMode && setTransformMode && (
            <div style={{ marginBottom: 8 }}>
                <Label>Transform Mode</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                    {["translate", "rotate", "scale"].map(mode => {
                        const isActive = transformMode === mode;
                        return (
                            <button
                                key={mode}
                                onClick={() => setTransformMode(mode as any)}
                                style={{
                                    ...buttonStyle,
                                    background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                                }}
                                onPointerEnter={(e) => {
                                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                }}
                                onPointerLeave={(e) => {
                                    if (!isActive) e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                {mode}
                            </button>
                        );
                    })}
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
