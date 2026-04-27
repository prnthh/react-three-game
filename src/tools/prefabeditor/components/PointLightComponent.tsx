import { useEffect, useRef } from 'react';
import { useHelper } from '@react-three/drei';
import { PointLightHelper } from 'three';
import type { PointLight } from 'three';
import { useNode } from '../assetRuntime';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, ColorField, NumberField } from './Input';
import { LightSection, ShadowBiasField, mergeWithDefaults } from './lightUtils';
import type { ComponentData } from '../types';

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

type PointLightProperties = typeof pointLightDefaults & Record<string, unknown>;


function PointLightComponentEditor({ component, onUpdate }: { component: ComponentData; onUpdate: (newComp: Record<string, unknown>) => void }) {
    const values = mergeWithDefaults(pointLightDefaults, component.properties) as PointLightProperties;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={onUpdate} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={onUpdate} min={0} step={0.1} fallback={1} />
                <NumberField name="distance" label="Distance" values={values} onChange={onUpdate} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={onUpdate} min={0} step={0.1} fallback={2} />
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
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}


function PointLightView({ properties, children }: ComponentViewProps) {
    const { editMode, isSelected } = useNode();
    const merged = mergeWithDefaults(pointLightDefaults, properties) as PointLightProperties;
    const lightProps = {
        color: merged.color,
        intensity: merged.intensity,
        distance: merged.distance,
        decay: merged.decay,
        castShadow: merged.castShadow,
        "shadow-mapSize-width": merged.shadowMapSize,
        "shadow-mapSize-height": merged.shadowMapSize,
        "shadow-bias": merged.shadowBias,
        "shadow-normalBias": merged.shadowNormalBias,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
    };
    const lightRef = useRef<PointLight>(null);
    const showHelper = editMode && isSelected && lightRef.current;
    const helperTarget = showHelper && lightRef.current ? { current: lightRef.current } : null;
    useHelper(helperTarget, PointLightHelper, 0.5);

    return (
        <group>
            <pointLight ref={lightRef} {...lightProps}>
                {children}
                {editMode && isSelected && (
                    <mesh>
                        <sphereGeometry args={[0.2, 10, 8]} />
                        <meshBasicMaterial color={merged.color} wireframe />
                    </mesh>
                )}
            </pointLight>
        </group>
    );
}


const PointLightComponent: Component = {
    name: 'PointLight',
    Editor: PointLightComponentEditor,
    View: PointLightView,
    defaultProperties: {},
};

export default PointLightComponent;