import { useShadowUpdates } from '../../../runtime/lighting/shadowUpdates';
import type { Component, ComponentViewProps } from "./ComponentRegistry";

import { useHelper } from "@react-three/drei";

import { useMemo, useRef } from "react";

import { CameraHelper, Object3D, SpotLightHelper } from "three";

import type { SpotLight } from "three";

import { useTextureAsset } from "../assetRuntime";

import { useNode } from "../SceneContext";

import { usePrefab } from "../SceneContext";

import { EditorLightGizmo, MAX_SHADOW_MAP_SIZE, MIN_SHADOW_MAP_SIZE, mergeWithDefaults, normalizeShadowMapSize, useShadowMapResolution } from "./lightUtils";

import { withBasePath } from "../runtimeUtils";

export const spotLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    angle: Math.PI / 3,
    penumbra: 0,
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
    targetOffset: [0, -5, 0] as [number, number, number],
    map: undefined as string | undefined,
};

export type SpotLightProperties = Partial<typeof spotLightDefaults>;

function SpotLightView({ properties, children }: ComponentViewProps<SpotLightProperties>) {
    const { editMode, isSelected } = useNode();
    const { basePath } = usePrefab();

    const merged = mergeWithDefaults(spotLightDefaults, properties);
    const shadowMapSize = normalizeShadowMapSize(merged.shadowMapSize);

    const resolvedMap = merged.map ? withBasePath(basePath, merged.map) : merged.map;
    const textureMap = useTextureAsset(resolvedMap) ?? undefined;

    const lightProps = {
        color: merged.color,
        intensity: merged.intensity,
        angle: merged.angle,
        penumbra: merged.penumbra,
        distance: merged.distance,
        decay: merged.decay,
        castShadow: merged.castShadow,
        map: textureMap,

        // mapped props
        "shadow-bias": merged.shadowBias,
        "shadow-normalBias": merged.shadowNormalBias,
        "shadow-intensity": merged.shadowIntensity,
        "shadow-radius": merged.shadowRadius,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
    };

    const spotLightRef = useRef<SpotLight>(null);
    const helperTargetRef = useRef<Object3D>(null!);
    const shadowCameraHelperRef = useRef<Object3D>(null!);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(spotLightRef, shadowMapSize);
    useShadowUpdates(spotLightRef);

    const showHelper = editMode && isSelected;
    const showShadowHelper = showHelper && Boolean(merged.castShadow);
    const shadowCamera = spotLightRef.current?.shadow.camera ?? null;
    if (spotLightRef.current) helperTargetRef.current = spotLightRef.current;
    if (shadowCamera) shadowCameraHelperRef.current = shadowCamera;
    useHelper(showHelper && spotLightRef.current ? helperTargetRef : null, SpotLightHelper);
    useHelper(showShadowHelper && shadowCamera ? shadowCameraHelperRef : null, CameraHelper);

    return (
        <group>
            <spotLight
                ref={spotLightRef}
                {...lightProps}
                target={target}
            >
                {editMode ? (
                    <EditorLightGizmo
                        color={merged.color}
                        selected={isSelected}
                    />
                ) : null}
                {showHelper && (
                    <>
                        <mesh position={merged.targetOffset}>
                            <sphereGeometry args={[0.15, 8, 6]} />
                            <meshBasicMaterial
                                color={merged.color}
                                wireframe
                                opacity={0.5}
                                transparent
                            />
                        </mesh>
                    </>
                )}

                {children}
            </spotLight>

            <primitive object={target} position={merged.targetOffset} />
        </group>
    );
}

const SpotLightComponent: Component<SpotLightProperties> = {
    name: 'SpotLight',
    slot: 'object',
    renderWhenDisabled: true,
    View: SpotLightView,
    properties: {
        color: { type: 'color', default: spotLightDefaults.color },
        intensity: { default: spotLightDefaults.intensity, min: 0, step: 0.1 },
        angle: { default: spotLightDefaults.angle, min: 0, max: Math.PI / 2, step: 0.05 },
        penumbra: { default: spotLightDefaults.penumbra, min: 0, max: 1, step: 0.05 },
        distance: { default: spotLightDefaults.distance, min: 0, step: 1 },
        decay: { default: spotLightDefaults.decay, min: 0, step: 0.1 },
        castShadow: { type: 'boolean', default: spotLightDefaults.castShadow },
        shadowMapSize: { default: spotLightDefaults.shadowMapSize, min: MIN_SHADOW_MAP_SIZE, max: MAX_SHADOW_MAP_SIZE, step: 128 },
        shadowBias: { default: spotLightDefaults.shadowBias, min: -1, max: 1 },
        shadowNormalBias: { default: spotLightDefaults.shadowNormalBias, min: -1, max: 1 },
        shadowIntensity: { default: spotLightDefaults.shadowIntensity, min: 0, max: 1, step: 0.05 },
        shadowRadius: { default: spotLightDefaults.shadowRadius, min: 0, step: 0.25 },
        shadowAutoUpdate: { type: 'boolean', default: spotLightDefaults.shadowAutoUpdate },
        shadowCameraNear: { default: spotLightDefaults.shadowCameraNear, min: 0.001, step: 0.1 },
        shadowCameraFar: { default: spotLightDefaults.shadowCameraFar, min: 0.1, step: 1 },
        targetOffset: { type: 'vector3', default: spotLightDefaults.targetOffset },
        map: { type: 'string', default: spotLightDefaults.map },
    },
};

export default SpotLightComponent;
