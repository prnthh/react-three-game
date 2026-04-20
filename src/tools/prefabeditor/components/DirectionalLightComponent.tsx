import { Component } from "./ComponentRegistry";
import { useHelper } from "@react-three/drei";
import { useRef, useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CameraHelper, DirectionalLight, Object3D, OrthographicCamera } from "three";
import { useEntityRuntime } from "../assetRuntime";
import { BooleanField, ColorField, NumberField, NumberInput, Vector3Input } from "./Input";
import { LightSection, ShadowBiasField, mergeWithDefaults } from "./lightUtils";
import { colors } from "../styles";

const directionalLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowAutoUpdate: true,
    shadowCameraNear: 0.5,
    shadowCameraFar: 500,
    shadowCameraTop: 5,
    shadowCameraBottom: -5,
    shadowCameraLeft: -5,
    shadowCameraRight: 5,
    targetOffset: [0, -5, 0] as [number, number, number],
};

const frustumLabelStyle: React.CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: colors.textMuted,
    textAlign: 'center',
};

const frustumCellStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const frustumInputStyle: React.CSSProperties = {
    width: 62,
    minWidth: 62,
    textAlign: 'center',
};

const centerLockButtonStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: colors.bgInput,
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
};

function areFrustumSidesLocked(values: typeof directionalLightDefaults) {
    const top = Math.abs(values.shadowCameraTop);
    const bottom = Math.abs(values.shadowCameraBottom);
    const left = Math.abs(values.shadowCameraLeft);
    const right = Math.abs(values.shadowCameraRight);
    return top === bottom && top === left && top === right;
}

function ShadowFrustumField({
    values,
    onChange,
}: {
    values: typeof directionalLightDefaults;
    onChange: (values: Record<string, number>) => void;
}) {
    const [locked, setLocked] = useState(() => areFrustumSidesLocked(values));

    const updateSide = (side: 'shadowCameraTop' | 'shadowCameraBottom' | 'shadowCameraLeft' | 'shadowCameraRight', nextValue: number) => {
        if (!locked) {
            onChange({ [side]: nextValue });
            return;
        }

        const magnitude = Math.abs(nextValue);
        onChange({
            shadowCameraTop: magnitude,
            shadowCameraBottom: -magnitude,
            shadowCameraLeft: -magnitude,
            shadowCameraRight: magnitude,
        });
    };

    const toggleLocked = () => {
        setLocked(current => {
            const nextLocked = !current;
            if (nextLocked) {
                const magnitude = Math.max(
                    Math.abs(values.shadowCameraTop),
                    Math.abs(values.shadowCameraBottom),
                    Math.abs(values.shadowCameraLeft),
                    Math.abs(values.shadowCameraRight),
                );
                onChange({
                    shadowCameraTop: magnitude,
                    shadowCameraBottom: -magnitude,
                    shadowCameraLeft: -magnitude,
                    shadowCameraRight: magnitude,
                });
            }
            return nextLocked;
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...frustumLabelStyle, textAlign: 'left' }}>Shadow Frustum</div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    gridTemplateRows: 'auto auto auto',
                    gap: 8,
                    alignItems: 'center',
                }}
            >
                <div />
                <div style={frustumCellStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div style={frustumLabelStyle}>Top</div>
                        <NumberInput
                            value={values.shadowCameraTop}
                            onChange={nextValue => updateSide('shadowCameraTop', nextValue)}
                            step={0.5}
                            style={frustumInputStyle}
                        />
                    </div>
                </div>
                <div />

                <div style={frustumCellStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div style={frustumLabelStyle}>Left</div>
                        <NumberInput
                            value={values.shadowCameraLeft}
                            onChange={nextValue => updateSide('shadowCameraLeft', nextValue)}
                            step={0.5}
                            style={frustumInputStyle}
                        />
                    </div>
                </div>

                <div style={frustumCellStyle}>
                    <button
                        type="button"
                        onClick={toggleLocked}
                        style={{
                            ...centerLockButtonStyle,
                            color: locked ? colors.accent : colors.textMuted,
                            borderColor: locked ? colors.accentBorder : colors.border,
                            background: locked ? colors.accentBg : colors.bgInput,
                        }}
                        title={locked ? 'Frustum sides locked' : 'Frustum sides unlocked'}
                    >
                        {locked ? '🔒' : '🔓'}
                    </button>
                </div>

                <div style={frustumCellStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div style={frustumLabelStyle}>Right</div>
                        <NumberInput
                            value={values.shadowCameraRight}
                            onChange={nextValue => updateSide('shadowCameraRight', nextValue)}
                            step={0.5}
                            style={frustumInputStyle}
                        />
                    </div>
                </div>

                <div />
                <div style={frustumCellStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div style={frustumLabelStyle}>Bottom</div>
                        <NumberInput
                            value={values.shadowCameraBottom}
                            onChange={nextValue => updateSide('shadowCameraBottom', nextValue)}
                            step={0.5}
                            style={frustumInputStyle}
                        />
                    </div>
                </div>
                <div />
            </div>
        </div>
    );
}

function DirectionalLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const values = mergeWithDefaults(directionalLightDefaults, component.properties);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={onUpdate} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={onUpdate} min={0} step={0.1} fallback={1} />
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => onUpdate({ targetOffset })}
                    snap={0.5}
                />
            </LightSection>
            <LightSection title="Shadow">
                <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={onUpdate} fallback={false} />
                {values.castShadow ? (
                    <>
                        <BooleanField name="shadowAutoUpdate" label="Auto Update" values={values} onChange={onUpdate} fallback={true} />
                        <NumberField name="shadowMapSize" label="Map Size" values={values} onChange={onUpdate} min={128} step={128} fallback={512} />
                        <ShadowBiasField name="shadowBias" label="Bias" values={values} onChange={onUpdate} fallback={0} />
                        <ShadowBiasField name="shadowNormalBias" label="Normal Bias" values={values} onChange={onUpdate} fallback={0} />
                        <NumberField name="shadowCameraNear" label="Near" values={values} onChange={onUpdate} min={0.001} step={0.1} fallback={0.5} />
                        <NumberField name="shadowCameraFar" label="Far" values={values} onChange={onUpdate} min={0.1} step={1} fallback={500} />
                        <ShadowFrustumField values={values} onChange={onUpdate} />
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}

function DirectionalLightView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const { editMode, isSelected } = useEntityRuntime();
    const merged = mergeWithDefaults(directionalLightDefaults, properties);
    const color = merged.color;
    const intensity = merged.intensity;
    const castShadow = merged.castShadow;
    const shadowMapSize = merged.shadowMapSize;
    const shadowBias = merged.shadowBias;
    const shadowNormalBias = merged.shadowNormalBias;
    const shadowAutoUpdate = merged.shadowAutoUpdate;
    const shadowCameraNear = merged.shadowCameraNear;
    const shadowCameraFar = merged.shadowCameraFar;
    const shadowCameraTop = merged.shadowCameraTop;
    const shadowCameraBottom = merged.shadowCameraBottom;
    const shadowCameraLeft = merged.shadowCameraLeft;
    const shadowCameraRight = merged.shadowCameraRight;
    const targetOffset = merged.targetOffset;
    const directionalLightRef = useRef<DirectionalLight>(null);
    const targetRef = useRef<Object3D>(null);
    const shadowCameraRef = useRef<OrthographicCamera>(null);
    const [shadowCamera, setShadowCamera] = useState<OrthographicCamera | null>(null);
    useHelper(
        editMode && isSelected && castShadow ? shadowCameraRef as React.RefObject<Object3D> : null,
        CameraHelper
    );

    // Use a local target object so node transforms rotate the light direction naturally.
    useEffect(() => {
        if (directionalLightRef.current && targetRef.current) {
            directionalLightRef.current.target = targetRef.current;
            const nextShadowCamera = directionalLightRef.current.shadow.camera;
            shadowCameraRef.current = nextShadowCamera;
            setShadowCamera(castShadow ? nextShadowCamera : null);
        }
    }, [castShadow]);

    useEffect(() => {
        const shadow = directionalLightRef.current?.shadow;
        if (!shadow) return;

        shadow.needsUpdate = true;
        shadow.camera.updateProjectionMatrix();
    }, [
        castShadow,
        shadowMapSize,
        shadowBias,
        shadowNormalBias,
        shadowAutoUpdate,
        shadowCameraNear,
        shadowCameraFar,
        shadowCameraTop,
        shadowCameraBottom,
        shadowCameraLeft,
        shadowCameraRight,
    ]);

    useFrame(() => {
        if (!directionalLightRef.current || !targetRef.current) return;

        directionalLightRef.current.target.updateMatrixWorld();

        if (shadowCamera && castShadow) {
            shadowCamera.updateProjectionMatrix();
            shadowCamera.updateMatrixWorld();
        }
    });

    return (
        <>
            <directionalLight
                ref={directionalLightRef}
                color={color}
                intensity={intensity}
                castShadow={castShadow}
                shadow-mapSize-width={shadowMapSize}
                shadow-mapSize-height={shadowMapSize}
                shadow-camera-near={shadowCameraNear}
                shadow-camera-far={shadowCameraFar}
                shadow-camera-top={shadowCameraTop}
                shadow-camera-bottom={shadowCameraBottom}
                shadow-camera-left={shadowCameraLeft}
                shadow-camera-right={shadowCameraRight}
                shadow-bias={shadowBias}
                shadow-normalBias={shadowNormalBias}
                shadow-autoUpdate={shadowAutoUpdate}
            />
            <object3D ref={targetRef} position={targetOffset as [number, number, number]} />
            {editMode && isSelected && (
                <>
                    {/* Light source indicator */}
                    <mesh>
                        <sphereGeometry args={[0.3, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe />
                    </mesh>
                    {/* Target indicator */}
                    <mesh position={targetOffset as [number, number, number]}>
                        <sphereGeometry args={[0.2, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe opacity={0.5} transparent />
                    </mesh>
                    {/* Direction line */}
                    <line>
                        <bufferGeometry>
                            <bufferAttribute
                                attach="attributes-position"
                                args={[new Float32Array([0, 0, 0, targetOffset[0], targetOffset[1], targetOffset[2]]), 3]}
                            />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} opacity={0.6} transparent />
                    </line>
                </>
            )}
            {children}
        </>
    );
}

const DirectionalLightComponent: Component = {
    name: 'DirectionalLight',
    Editor: DirectionalLightComponentEditor,
    View: DirectionalLightView,
    defaultProperties: {}
};

export default DirectionalLightComponent;
