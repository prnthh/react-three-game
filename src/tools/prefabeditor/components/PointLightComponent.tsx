import { useRef } from 'react';
import { useHelper } from '@react-three/drei';
import { PointLightHelper } from 'three';
import type { Object3D, PointLight } from 'three';
import { useNode } from '../SceneContext';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, ColorField, NumberField } from './Input';
import {
    EditorLightGizmo,
    LightSection,
    MAX_SHADOW_MAP_SIZE,
    MIN_SHADOW_MAP_SIZE,
    ShadowBiasField,
    mergeWithDefaults,
    normalizeShadowMapSize,
    useShadowMapResolution,
} from './lightUtils';

const pointLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    distance: 0,
    decay: 2,
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowAutoUpdate: true,
    shadowCameraNear: 0.5,
    shadowCameraFar: 500,
};

type PointLightProperties = Partial<typeof pointLightDefaults>;


function PointLightComponentEditor({ properties, update }: ComponentEditorProps<PointLightProperties>) {
    const values = mergeWithDefaults(pointLightDefaults, properties);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <NumberField name="distance" label="Distance" values={values} onChange={update} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={update} min={0} step={0.1} fallback={2} />
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
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}


function PointLightView({ properties, children }: ComponentViewProps<PointLightProperties>) {
    const { editMode, isSelected } = useNode();
    const merged = mergeWithDefaults(pointLightDefaults, properties);
    const shadowMapSize = normalizeShadowMapSize(merged.shadowMapSize);
    const shadowCameraNear = Math.max(0.001, Number(merged.shadowCameraNear) || 0.5);
    const shadowCameraFar = Math.max(shadowCameraNear, Number(merged.shadowCameraFar) || 500);
    const lightProps = {
        color: merged.color,
        intensity: merged.intensity,
        distance: merged.distance,
        decay: merged.decay,
        castShadow: merged.castShadow,
        "shadow-bias": merged.shadowBias,
        "shadow-normalBias": merged.shadowNormalBias,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
    };
    const lightRef = useRef<PointLight>(null);
    const helperTargetRef = useRef<Object3D>(null!);
    useShadowMapResolution(lightRef, shadowMapSize);
    const showHelper = editMode && isSelected && lightRef.current;
    if (lightRef.current) helperTargetRef.current = lightRef.current;
    useHelper(showHelper ? helperTargetRef : null, PointLightHelper, 0.5);

    return (
        <group>
            <pointLight ref={lightRef} {...lightProps}>
                {children}
                {editMode ? (
                    <EditorLightGizmo
                        color={merged.color}
                        selected={isSelected}
                    />
                ) : null}
                {editMode && isSelected && merged.castShadow ? (
                    <mesh scale={shadowCameraFar}>
                        <sphereGeometry args={[1, 24, 12]} />
                        <meshBasicMaterial
                            color={merged.color}
                            wireframe
                            transparent
                            opacity={0.22}
                            depthWrite={false}
                        />
                    </mesh>
                ) : null}
            </pointLight>
        </group>
    );
}


const PointLightComponent: Component<PointLightProperties> = {
    name: 'PointLight',
    Editor: PointLightComponentEditor,
    View: PointLightView,
    defaultProperties: {},
};

export default PointLightComponent;
