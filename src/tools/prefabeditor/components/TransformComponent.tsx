import { Component } from "./ComponentRegistry";
import { Label, Vector3Field, Vector3Input } from "./Input";
import { useEditorContext } from "../EditorContext";
import { colors } from "../styles";

const buttonStyle = {
    padding: '4px 8px',
    background: colors.bgSurface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 3,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 11,
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
                                background: isActive ? colors.accentBg : colors.bgSurface,
                                borderColor: isActive ? colors.accentBorder : colors.border,
                                color: isActive ? colors.accent : colors.text,
                            }}
                            onPointerEnter={(e) => {
                                if (!isActive) e.currentTarget.style.background = colors.bgHover;
                            }}
                            onPointerLeave={(e) => {
                                if (!isActive) e.currentTarget.style.background = colors.bgSurface;
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
                        background: snapResolution > 0 ? colors.accentBg : colors.bgSurface,
                        borderColor: snapResolution > 0 ? colors.accentBorder : colors.border,
                        color: snapResolution > 0 ? colors.accent : colors.text,
                        width: '100%',
                    }}
                    onPointerEnter={(e) => {
                        if (snapResolution === 0) e.currentTarget.style.background = colors.bgHover;
                    }}
                    onPointerLeave={(e) => {
                        if (snapResolution === 0) e.currentTarget.style.background = colors.bgSurface;
                    }}
                >
                    Snap: {snapResolution > 0 ? `ON (${snapResolution})` : 'OFF'}
                </button>
            </div>
        </div>
    );
}

const snapLockBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: 12,
    lineHeight: 1,
    color: colors.textMuted,
};

function SnapLockButton({ locked, onToggle, title }: { locked: boolean; onToggle: () => void; title: string }) {
    return (
        <button style={snapLockBtnStyle} onClick={onToggle} title={title}>
            {locked ? '🔒' : '🔓'}
        </button>
    );
}

function TransformComponentEditor({ component, onUpdate }: {
    component: any;
    onUpdate: (newComp: any) => void;
}) {
    const {
        transformMode,
        setTransformMode,
        snapResolution,
        setSnapResolution,
        positionSnap,
        setPositionSnap,
        rotationSnap,
        setRotationSnap
    } = useEditorContext();

    const positionSnapped = positionSnap > 0;
    const rotationSnapped = rotationSnap > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <TransformModeSelector
                transformMode={transformMode}
                setTransformMode={setTransformMode}
                snapResolution={snapResolution}
                setSnapResolution={setSnapResolution}
            />
            <Vector3Input
                label="Position"
                value={component.properties.position ?? [0, 0, 0]}
                onChange={v => onUpdate({ position: v })}
                snap={positionSnap}
                labelExtra={
                    <SnapLockButton
                        locked={positionSnapped}
                        onToggle={() => setPositionSnap(positionSnapped ? 0 : 0.5)}
                        title={positionSnapped ? `Snap ON (0.5) — click to disable` : `Snap OFF — click to enable (0.5)`}
                    />
                }
            />
            <Vector3Input
                label="Rotation"
                value={component.properties.rotation ?? [0, 0, 0]}
                onChange={v => onUpdate({ rotation: v })}
                snap={rotationSnap}
                labelExtra={
                    <SnapLockButton
                        locked={rotationSnapped}
                        onToggle={() => setRotationSnap(rotationSnapped ? 0 : Math.PI / 4)}
                        title={rotationSnapped ? `Snap ON (π/4) — click to disable` : `Snap OFF — click to enable (π/4)`}
                    />
                }
            />
            <Vector3Field
                name="scale"
                label="Scale"
                values={component.properties}
                onChange={onUpdate}
                fallback={[1, 1, 1]}
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
