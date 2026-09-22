import { CascadedDirectionalLight } from '../../../runtime/lighting/CascadedDirectionalLight';
import { useShadowUpdates } from '../../../runtime/lighting/shadowUpdates';
import type { Component, ComponentViewProps } from "./ComponentRegistry";

import { useHelper } from "@react-three/drei";

import { useMemo, useRef } from "react";

import { CameraHelper, Object3D } from "three";

import type { DirectionalLight } from "three";

import { useNode } from "../SceneContext";

import { EditorLightGizmo, mergeWithDefaults, normalizeShadowMapSize, useShadowMapResolution } from "./lightUtils";

export const directionalLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowIntensity: 1,
    shadowRadius: 1,
    shadowAutoUpdate: true,
    shadowCascades: 1,
    shadowDistance: 100,
    shadowCameraNear: 0.5,
    shadowCameraFar: 500,
    shadowCameraTop: 5,
    shadowCameraBottom: -5,
    shadowCameraLeft: -5,
    shadowCameraRight: 5,
    targetOffset: [0, -5, 0] as [number, number, number],
};

export type DirectionalLightValues = typeof directionalLightDefaults;

export type DirectionalLightProperties = Partial<DirectionalLightValues>;

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
        "shadow-intensity": merged.shadowIntensity,
        "shadow-radius": merged.shadowRadius,
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
    useShadowUpdates(directionalLightRef);

    // Show CameraHelper only in edit mode, selected, and castShadow
    const showHelper = editMode && isSelected && merged.castShadow;
    const shadowCamera = directionalLightRef.current?.shadow.camera ?? null;
    if (shadowCamera) helperTargetRef.current = shadowCamera;
    useHelper(showHelper && shadowCamera ? helperTargetRef : null, CameraHelper);

    const Light = merged.castShadow && merged.shadowCascades > 1 ? CascadedDirectionalLight : 'directionalLight';
    const cascadeProps = Light === CascadedDirectionalLight
        ? { cascades: merged.shadowCascades, maxFar: merged.shadowDistance } : {};
    return (
        <group>
            <Light
                {...cascadeProps}
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
            </Light>

            <primitive object={target} position={merged.targetOffset} />

        </group>
    );
}

const DirectionalLightComponent: Component<DirectionalLightProperties> = {
    name: 'DirectionalLight',
    slot: 'object',
    renderWhenDisabled: true,
    View: DirectionalLightView,
    properties: {
        color: { type: 'color', default: directionalLightDefaults.color },
        intensity: { default: directionalLightDefaults.intensity },
        castShadow: { type: 'boolean', default: directionalLightDefaults.castShadow },
        shadowMapSize: { default: directionalLightDefaults.shadowMapSize },
        shadowBias: { default: directionalLightDefaults.shadowBias },
        shadowNormalBias: { default: directionalLightDefaults.shadowNormalBias },
        shadowIntensity: { default: directionalLightDefaults.shadowIntensity, min: 0, max: 1, step: 0.05 },
        shadowRadius: { default: directionalLightDefaults.shadowRadius, min: 0, step: 0.25 },
        shadowCascades: { default: 1, min: 1, max: 4, step: 1 },
        shadowDistance: { default: 100, min: 1 },
        shadowAutoUpdate: { type: 'boolean', default: directionalLightDefaults.shadowAutoUpdate },
        shadowCameraNear: { default: directionalLightDefaults.shadowCameraNear },
        shadowCameraFar: { default: directionalLightDefaults.shadowCameraFar },
        shadowCameraTop: { default: directionalLightDefaults.shadowCameraTop },
        shadowCameraBottom: { default: directionalLightDefaults.shadowCameraBottom },
        shadowCameraLeft: { default: directionalLightDefaults.shadowCameraLeft },
        shadowCameraRight: { default: directionalLightDefaults.shadowCameraRight },
        targetOffset: { type: 'vector3', default: directionalLightDefaults.targetOffset },
    },
};

export default DirectionalLightComponent;
