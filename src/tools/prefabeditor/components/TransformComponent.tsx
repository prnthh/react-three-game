import { Component } from "./ComponentRegistry";
import { FieldRenderer, FieldDefinition, Label } from "./Input";
import { useEditorContext } from "../EditorContext";

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

function TransformModeSelector({
    transformMode,
    setTransformMode,
    snapResolution,
    setSnapResolution
}: {
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (m: "translate" | "rotate" | "scale") => void;
    snapResolution: number;
    setSnapResolution: (v: number) => void;
}) {
    return (
        <div style={{ marginBottom: 8 }}>
            <Label>Transform Mode {snapResolution > 0 && `(Snap: ${snapResolution})`}</Label>
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
            <div style={{ marginTop: 6 }}>
                <button
                    onClick={() => setSnapResolution(snapResolution > 0 ? 0 : 0.1)}
                    style={{
                        ...buttonStyle,
                        background: snapResolution > 0 ? 'rgba(255,255,255,0.10)' : 'transparent',
                        width: '100%',
                    }}
                    onPointerEnter={(e) => {
                        if (snapResolution === 0) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    }}
                    onPointerLeave={(e) => {
                        if (snapResolution === 0) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    Snap: {snapResolution > 0 ? `ON (${snapResolution})` : 'OFF'}
                </button>
            </div>
        </div>
    );
}

function TransformComponentEditor({ component, onUpdate }: {
    component: any;
    onUpdate: (newComp: any) => void;
}) {
    const { transformMode, setTransformMode, snapResolution, setSnapResolution } = useEditorContext();

    const fields: FieldDefinition[] = [
        { name: 'position', type: 'vector3', label: 'Position', snap: snapResolution },
        { name: 'rotation', type: 'vector3', label: 'Rotation', snap: snapResolution },
        { name: 'scale', type: 'vector3', label: 'Scale', snap: snapResolution },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <TransformModeSelector
                transformMode={transformMode}
                setTransformMode={setTransformMode}
                snapResolution={snapResolution}
                setSnapResolution={setSnapResolution}
            />
            <FieldRenderer
                fields={fields}
                values={component.properties}
                onChange={onUpdate}
            />
        </div>
    );
}

const TransformComponent: Component = {
    name: 'Transform',
    Editor: TransformComponentEditor,
    nonComposable: true,
    defaultProperties: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    }
};

export default TransformComponent;
