import { useEffect, useRef } from 'react';
import { useHelper } from '@react-three/drei';
import { Object3D, PointLight, PointLightHelper } from 'three';
import { Component } from './ComponentRegistry';
import { BooleanField, ColorField, NumberField } from './Input';
import { LightSection, ShadowBiasField, mergeWithDefaults } from './lightUtils';

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

function PointLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const values = mergeWithDefaults(pointLightDefaults, component.properties);

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

function PointLightView({ properties, children, editMode, isSelected }: { properties: any; children?: React.ReactNode; editMode?: boolean; isSelected?: boolean }) {
    const merged = mergeWithDefaults(pointLightDefaults, properties);
    const color = merged.color;
    const intensity = merged.intensity;
    const distance = merged.distance;
    const decay = merged.decay;
    const castShadow = merged.castShadow;
    const shadowMapSize = merged.shadowMapSize;
    const shadowBias = merged.shadowBias;
    const shadowNormalBias = merged.shadowNormalBias;
    const shadowAutoUpdate = merged.shadowAutoUpdate;
    const shadowCameraNear = merged.shadowCameraNear;
    const shadowCameraFar = merged.shadowCameraFar;
    const lightRef = useRef<PointLight>(null);
    useHelper(
        editMode && isSelected ? lightRef as React.RefObject<Object3D> : null,
        PointLightHelper,
        0.5,
        color
    );

    useEffect(() => {
        const shadow = lightRef.current?.shadow;
        if (!shadow) return;

        shadow.needsUpdate = true;
        shadow.camera.updateProjectionMatrix();
    }, [castShadow, shadowMapSize, shadowBias, shadowNormalBias, shadowAutoUpdate, shadowCameraNear, shadowCameraFar]);

    return (
        <>
            <pointLight
                ref={lightRef}
                color={color}
                intensity={intensity}
                distance={distance}
                decay={decay}
                castShadow={castShadow}
                shadow-mapSize-width={shadowMapSize}
                shadow-mapSize-height={shadowMapSize}
                shadow-bias={shadowBias}
                shadow-normalBias={shadowNormalBias}
                shadow-autoUpdate={shadowAutoUpdate}
                shadow-camera-near={shadowCameraNear}
                shadow-camera-far={shadowCameraFar}
            />
            {editMode && isSelected ? (
                <mesh>
                    <sphereGeometry args={[0.2, 10, 8]} />
                    <meshBasicMaterial color={color} wireframe />
                </mesh>
            ) : null}
            {children}
        </>
    );
}

const PointLightComponent: Component = {
    name: 'PointLight',
    Editor: PointLightComponentEditor,
    View: PointLightView,
    defaultProperties: {},
};

export default PointLightComponent;