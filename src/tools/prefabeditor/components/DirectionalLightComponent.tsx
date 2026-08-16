import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { useHelper } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { CameraHelper, Object3D } from "three";
import type { DirectionalLight } from "three";
import { useNode } from "../SceneContext";
import { BooleanField, ColorField, NumberField, NumberInput, Vector3Input } from "./Input";
import {
    EditorLightGizmo,
    LightSection,
    MAX_SHADOW_MAP_SIZE,
    MIN_SHADOW_MAP_SIZE,
    ShadowBiasField,
    mergeWithDefaults,
    normalizeShadowMapSize,
    useShadowMapResolution,
} from "./lightUtils";
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

type DirectionalLightValues = typeof directionalLightDefaults;
type DirectionalLightProperties = Partial<DirectionalLightValues>;


function ShadowFrustumField({ values, onChange }: { values: DirectionalLightValues; onChange: (values: Partial<DirectionalLightValues>) => void }) {
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


function DirectionalLightComponentEditor({ properties, update }: ComponentEditorProps<DirectionalLightProperties>) {
    const values = mergeWithDefaults(directionalLightDefaults, properties);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => update({ targetOffset })}
                    snap={0.5}
                />
            </LightSection>
            <LightSection title="Shadow">
                <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={update} fallback={false} />
                {values.castShadow ? (
                    <>
                        <BooleanField name="shadowAutoUpdate" label="Auto Update" values={values} onChange={update} fallback={true} />
                        <NumberField
                            name="shadowMapSize"
                            label="Map Size"
                            values={values}
                            onChange={update}
                            min={MIN_SHADOW_MAP_SIZE}
                            max={MAX_SHADOW_MAP_SIZE}
                            step={128}
                            fallback={512}
                            commitOnBlur
                        />
                        <ShadowBiasField name="shadowBias" label="Bias" values={values} onChange={update} fallback={0} />
                        <ShadowBiasField name="shadowNormalBias" label="Normal Bias" values={values} onChange={update} fallback={0} />
                        <NumberField name="shadowCameraNear" label="Near" values={values} onChange={update} min={0.001} step={0.1} fallback={0.5} />
                        <NumberField name="shadowCameraFar" label="Far" values={values} onChange={update} min={0.1} step={1} fallback={500} />
                        <ShadowFrustumField values={values} onChange={update} />
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}


function DirectionalLightView({ properties, children }: ComponentViewProps<DirectionalLightProperties>) {
    const { editMode, isSelected } = useNode();
    const merged = mergeWithDefaults(directionalLightDefaults, properties);
    const shadowMapSize = normalizeShadowMapSize(merged.shadowMapSize);
    const lightProps = {
        color: merged.color,
        intensity: merged.intensity,
        castShadow: merged.castShadow,
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
    const helperTargetRef = useRef<Object3D>(null!);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(directionalLightRef, shadowMapSize);

    // Show CameraHelper only in edit mode, selected, and castShadow
    const showHelper = editMode && isSelected && merged.castShadow;
    const shadowCamera = directionalLightRef.current?.shadow.camera ?? null;
    if (shadowCamera) helperTargetRef.current = shadowCamera;
    useHelper(showHelper && shadowCamera ? helperTargetRef : null, CameraHelper);

    return (
        <group>
            <directionalLight
                ref={directionalLightRef}
                {...lightProps}
                target={target}
            >
                {children}
                {editMode ? (
                    <EditorLightGizmo
                        color={merged.color}
                        selected={isSelected}
                    />
                ) : null}
                {editMode && isSelected && (
                    <>
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

            <primitive object={target} position={merged.targetOffset} />

        </group>
    );
}


const DirectionalLightComponent: Component<DirectionalLightProperties> = {
    name: 'DirectionalLight',
    Editor: DirectionalLightComponentEditor,
    View: DirectionalLightView,
    defaultProperties: {},
};

export default DirectionalLightComponent;
