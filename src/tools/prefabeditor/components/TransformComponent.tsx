import { Component } from "./ComponentRegistry";
import { Label, Vector3Input } from "./Input";
import { useEditorContext } from "../PrefabEditor";
import { colors } from "../styles";

const buttonStyle = {
    padding: '2px 6px',
    background: colors.bgSurface,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 0,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 11,
    flex: 1,
    minHeight: 22,
};

function TransformModeSelector({
    transformMode,
    setTransformMode
}: {
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (m: "translate" | "rotate" | "scale") => void;
}) {
    return (
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
        </div>
    );
}

const snapLockBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
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
        scaleSnap,
        setScaleSnap,
        positionSnap,
        setPositionSnap,
        rotationSnap,
        setRotationSnap
    } = useEditorContext();

    const scaleSnapped = scaleSnap > 0;
    const positionSnapped = positionSnap > 0;
    const rotationSnapped = rotationSnap > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <TransformModeSelector
                transformMode={transformMode}
                setTransformMode={setTransformMode}
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
            <Vector3Input
                label="Scale"
                value={component.properties.scale ?? [1, 1, 1]}
                onChange={v => onUpdate({ scale: v })}
                snap={scaleSnap}
                labelExtra={
                    <SnapLockButton
                        locked={scaleSnapped}
                        onToggle={() => setScaleSnap(scaleSnapped ? 0 : 0.1)}
                        title={scaleSnapped ? `Snap ON (0.1) — click to disable` : `Snap OFF — click to enable (0.1)`}
                    />
                }
            />
        </div>
    );
}

const TransformComponent: Component = {
    name: 'Transform',
    disableSiblingComposition: true,
    Editor: TransformComponentEditor,
    defaultProperties: {}
};

export default TransformComponent;
