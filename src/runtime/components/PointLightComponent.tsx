import { useRef } from 'react';

import { useHelper } from '@react-three/drei';

import { PointLightHelper } from 'three';

import type { PointLight } from 'three';

import { useNode } from '../scene/SceneContext.js';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

import { EditorLightGizmo, MAX_SHADOW_MAP_SIZE, MIN_SHADOW_MAP_SIZE, normalizeShadowMapSize, useShadowMapResolution } from './lightUtils.js';

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
    const editMode = useNode(node => node.editMode);
    const isSelected = useNode(node => node.isSelected);
    const shadowMapSize = normalizeShadowMapSize(properties.shadowMapSize);
    const lightProps = {
        color: properties.color,
        intensity: properties.intensity,
        distance: properties.distance,
        decay: properties.decay,
        castShadow: properties.castShadow,
        "shadow-bias": properties.shadowBias,
        "shadow-normalBias": properties.shadowNormalBias,
        "shadow-intensity": properties.shadowIntensity,
        "shadow-radius": properties.shadowRadius,
        "shadow-autoUpdate": properties.shadowAutoUpdate,
        "shadow-camera-near": properties.shadowCameraNear,
        "shadow-camera-far": properties.shadowCameraFar,
    };
    const lightRef = useRef<PointLight>(null!);
    useShadowMapResolution(lightRef, shadowMapSize);
    const showHelper = editMode && isSelected;
    useHelper(showHelper ? lightRef : null, PointLightHelper, 0.5);

    return (
        <group>
            <pointLight ref={lightRef} {...lightProps}>
                {children}
                {editMode ? (
                    <EditorLightGizmo
                        color={properties.color}
                        selected={isSelected}
                    />
                ) : null}
                {editMode && isSelected && properties.castShadow ? (
                    <mesh scale={properties.shadowCameraFar} userData={{ editorHelper: true }}>
                        <sphereGeometry args={[1, 24, 12]} />
                        <meshBasicMaterial
                            color={properties.color}
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
    renderWhenDisabled: true,
    description: "Emit light in all directions from this node. Position with Transform; set distance for a finite range and castShadow when shadows are needed.",
    category: 'lighting',
    View: PointLightView,
    properties: {
        color: { type: 'color', default: pointLightDefaults.color },
        intensity: { default: pointLightDefaults.intensity, min: 0, step: 0.1 },
        distance: { description: "Light cutoff distance in scene units; 0 means no finite cutoff.", default: pointLightDefaults.distance, min: 0, step: 1 },
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
