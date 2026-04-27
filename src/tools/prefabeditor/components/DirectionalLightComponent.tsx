import type { Component, ComponentViewProps } from "./ComponentRegistry";
import { useHelper } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { CameraHelper } from "three";
import type { Object3D } from "three";
import type { DirectionalLight, OrthographicCamera } from "three";
import { useNode } from "../assetRuntime";
import { BooleanField, ColorField, NumberField, NumberInput, Vector3Input } from "./Input";
import { LightSection, ShadowBiasField, mergeWithDefaults } from "./lightUtils";
import { colors } from "../styles";
import type { ComponentData } from "../types";

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

type DirectionalLightProperties = typeof directionalLightDefaults & Record<string, unknown>;


function ShadowFrustumField({ values, onChange }: { values: DirectionalLightProperties; onChange: (values: Record<string, number>) => void }) {
    // Minimal, no lock UI for simplicity (can add back if needed)
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textMuted, textAlign: 'left' }}>Shadow Frustum</div>
            <div style={{ display: 'flex', gap: 8 }}>
                <NumberInput
                    value={values.shadowCameraTop}
                    onChange={v => onChange({ shadowCameraTop: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Top"
                />
                <NumberInput
                    value={values.shadowCameraBottom}
                    onChange={v => onChange({ shadowCameraBottom: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Bottom"
                />
                <NumberInput
                    value={values.shadowCameraLeft}
                    onChange={v => onChange({ shadowCameraLeft: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Left"
                />
                <NumberInput
                    value={values.shadowCameraRight}
                    onChange={v => onChange({ shadowCameraRight: v })}
                    step={0.5}
                    style={{ width: 62, minWidth: 62, textAlign: 'center' }}
                    label="Right"
                />
            </div>
        </div>
    );
}


function DirectionalLightComponentEditor({ component, onUpdate }: { component: ComponentData; onUpdate: (newComp: Record<string, unknown>) => void }) {
    const values = mergeWithDefaults(directionalLightDefaults, component.properties) as DirectionalLightProperties;
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


function DirectionalLightView({ properties, children }: ComponentViewProps) {
    const { editMode, isSelected } = useNode();
    const merged = mergeWithDefaults(directionalLightDefaults, properties) as DirectionalLightProperties;
    const lightProps = {
        color: merged.color,
        intensity: merged.intensity,
        castShadow: merged.castShadow,
        "shadow-mapSize-width": merged.shadowMapSize,
        "shadow-mapSize-height": merged.shadowMapSize,
        "shadow-bias": merged.shadowBias,
        "shadow-normalBias": merged.shadowNormalBias,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
        "shadow-camera-top": merged.shadowCameraTop,
        "shadow-camera-bottom": merged.shadowCameraBottom,
        "shadow-camera-left": merged.shadowCameraLeft,
        "shadow-camera-right": merged.shadowCameraRight,
    };
    const directionalLightRef = useRef<DirectionalLight>(null);
    const targetRef = useRef<Object3D | null>(null);
    const shadowCameraRef = useRef<OrthographicCamera>(null);

    // Show CameraHelper only in edit mode, selected, and castShadow
    const showHelper = editMode && isSelected && merged.castShadow;
    const helperTarget = showHelper && shadowCameraRef.current ? { current: shadowCameraRef.current } : null;
    useHelper(helperTarget, CameraHelper);

    useEffect(() => {
        if (directionalLightRef.current) {
            shadowCameraRef.current = directionalLightRef.current.shadow.camera;
        }
    }, []);

    useEffect(() => {
        const light = directionalLightRef.current;
        if (!light) return;

        const cam = light.shadow.camera;
        cam.updateProjectionMatrix();

        light.shadow.needsUpdate = true;
    }, [
        merged.shadowCameraTop,
        merged.shadowCameraBottom,
        merged.shadowCameraLeft,
        merged.shadowCameraRight,
        merged.shadowCameraNear,
        merged.shadowCameraFar,
    ]);

    return (
        <group>
            <directionalLight
                ref={directionalLightRef}
                {...lightProps}
                // Attach the target object
                target={targetRef.current ?? undefined}
            >
                {children}
                {editMode && isSelected && (
                    <>
                        {/* Light source indicator */}
                        <mesh>
                            <sphereGeometry args={[0.3, 8, 6]} />
                            <meshBasicMaterial color={merged.color} wireframe />
                        </mesh>
                        {/* Target indicator */}
                        <mesh position={merged.targetOffset}>
                            <sphereGeometry args={[0.2, 8, 6]} />
                            <meshBasicMaterial color={merged.color} wireframe opacity={0.5} transparent />
                        </mesh>
                        {/* Direction line */}
                        <line>
                            <bufferGeometry>
                                <bufferAttribute
                                    attach="attributes-position"
                                    args={[new Float32Array([0, 0, 0, merged.targetOffset[0], merged.targetOffset[1], merged.targetOffset[2]]), 3]}
                                />
                            </bufferGeometry>
                            <lineBasicMaterial color={merged.color} opacity={0.6} transparent />
                        </line>
                    </>
                )}
            </directionalLight>

            <object3D ref={targetRef} position={merged.targetOffset} />

        </group>
    );
}


const DirectionalLightComponent: Component = {
    name: 'DirectionalLight',
    Editor: DirectionalLightComponentEditor,
    View: DirectionalLightView,
    defaultProperties: {},
};

export default DirectionalLightComponent;
