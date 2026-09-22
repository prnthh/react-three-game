import { useShadowUpdates } from '../../../runtime/lighting/shadowUpdates';
import { useRef } from 'react';

import { useHelper } from '@react-three/drei';

import { PointLightHelper } from 'three';

import type { Object3D, PointLight } from 'three';

import { useNode } from '../SceneContext';

import type { Component, ComponentViewProps } from './ComponentRegistry';

import { EditorLightGizmo, MAX_SHADOW_MAP_SIZE, MIN_SHADOW_MAP_SIZE, mergeWithDefaults, normalizeShadowMapSize, useShadowMapResolution } from './lightUtils';

export const pointLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    distance: 0,
    decay: 2,
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowIntensity: 1,
    shadowRadius: 1,
    shadowAutoUpdate: true,
    shadowCameraNear: 0.5,
    shadowCameraFar: 500,
};

export type PointLightProperties = Partial<typeof pointLightDefaults>;

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
        "shadow-intensity": merged.shadowIntensity,
        "shadow-radius": merged.shadowRadius,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
    };
    const lightRef = useRef<PointLight>(null);
    const helperTargetRef = useRef<Object3D>(null!);
    useShadowMapResolution(lightRef, shadowMapSize);
    useShadowUpdates(lightRef);
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
    slot: 'object',
    renderWhenDisabled: true,
    View: PointLightView,
    properties: {
        color: { type: 'color', default: pointLightDefaults.color },
        intensity: { default: pointLightDefaults.intensity, min: 0, step: 0.1 },
        distance: { default: pointLightDefaults.distance, min: 0, step: 1 },
        decay: { default: pointLightDefaults.decay, min: 0, step: 0.1 },
        castShadow: { type: 'boolean', default: pointLightDefaults.castShadow },
        shadowMapSize: { default: pointLightDefaults.shadowMapSize, min: MIN_SHADOW_MAP_SIZE, max: MAX_SHADOW_MAP_SIZE, step: 128 },
        shadowBias: { default: pointLightDefaults.shadowBias, min: -1, max: 1 },
        shadowNormalBias: { default: pointLightDefaults.shadowNormalBias, min: -1, max: 1 },
        shadowIntensity: { default: pointLightDefaults.shadowIntensity, min: 0, max: 1, step: 0.05 },
        shadowRadius: { default: pointLightDefaults.shadowRadius, min: 0, step: 0.25 },
        shadowAutoUpdate: { type: 'boolean', default: pointLightDefaults.shadowAutoUpdate },
        shadowCameraNear: { default: pointLightDefaults.shadowCameraNear, min: 0.001, step: 0.1 },
        shadowCameraFar: { default: pointLightDefaults.shadowCameraFar, min: 0.1, step: 1 },
    },
};

export default PointLightComponent;
