import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";

import { useHelper } from "@react-three/drei";

import { useMemo, useRef } from "react";

import { CameraHelper, Object3D, SpotLightHelper } from "three";

import type { SpotLight } from "three";

import { useTextureAsset } from "../assets/AssetRuntime.js";

import { useNode } from "../scene/SceneContext.js";

import { usePrefab } from "../scene/SceneContext.js";

import { EditorLightGizmo, MAX_SHADOW_MAP_SIZE, MIN_SHADOW_MAP_SIZE, normalizeShadowMapSize, useShadowMapResolution } from "./lightUtils.js";

import { withBasePath } from "../assets/assetPaths.js";

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
    const editMode = useNode(node => node.editMode);
    const isSelected = useNode(node => node.isSelected);
    const { basePath } = usePrefab();

    const shadowMapSize = normalizeShadowMapSize(properties.shadowMapSize);

    const resolvedMap = properties.map ? withBasePath(basePath, properties.map) : properties.map;
    const textureMap = useTextureAsset(resolvedMap) ?? undefined;

    const lightProps = {
        color: properties.color,
        intensity: properties.intensity,
        angle: properties.angle,
        penumbra: properties.penumbra,
        distance: properties.distance,
        decay: properties.decay,
        castShadow: properties.castShadow,
        map: textureMap,

        // mapped props
        "shadow-bias": properties.shadowBias,
        "shadow-normalBias": properties.shadowNormalBias,
        "shadow-intensity": properties.shadowIntensity,
        "shadow-radius": properties.shadowRadius,
        "shadow-autoUpdate": properties.shadowAutoUpdate,
        "shadow-camera-near": properties.shadowCameraNear,
        "shadow-camera-far": properties.shadowCameraFar,
    };

    const spotLightRef = useRef<SpotLight>(null!);
    const shadowCameraHelperRef = useRef<Object3D>(null!);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(spotLightRef, shadowMapSize);

    const showHelper = editMode && isSelected;
    const showShadowHelper = showHelper && Boolean(properties.castShadow);
    const shadowCamera = spotLightRef.current?.shadow.camera ?? null;
    if (shadowCamera) shadowCameraHelperRef.current = shadowCamera;
    useHelper(showHelper ? spotLightRef : null, SpotLightHelper);
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
                        color={properties.color}
                        selected={isSelected}
                        targetOffset={properties.targetOffset}
                    />
                ) : null}
                {showHelper && (
                    <>
                        <mesh position={properties.targetOffset} userData={{ editorHelper: true }}>
                            <sphereGeometry args={[0.15, 8, 6]} />
                            <meshBasicMaterial
                                color={properties.color}
                                wireframe
                                opacity={0.5}
                                transparent
                            />
                        </mesh>
                    </>
                )}

                {children}
            </spotLight>

            <primitive object={target} position={properties.targetOffset} />
        </group>
    );
}

const SpotLightComponent: Component<SpotLightProperties> = {
    name: 'SpotLight',
    renderWhenDisabled: true,
    description: "Emit a cone of light from this node toward targetOffset. Position with Transform; angle controls cone width and penumbra softens its edge.",
    category: 'lighting',
    View: SpotLightView,
    properties: {
        color: { type: 'color', default: spotLightDefaults.color },
        intensity: { default: spotLightDefaults.intensity, min: 0, step: 0.1 },
        angle: { description: "Cone half-angle in radians, from 0 to PI/2.", default: spotLightDefaults.angle, min: 0, max: Math.PI / 2, step: 0.05 },
        penumbra: { description: "Soft edge fraction: 0 is sharp, 1 softens the whole cone.", default: spotLightDefaults.penumbra, min: 0, max: 1, step: 0.05 },
        distance: { description: "Light cutoff distance in scene units; 0 means no finite cutoff.", default: spotLightDefaults.distance, min: 0, step: 1 },
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
        targetOffset: { description: "Aim point relative to this node, in local scene units; the node transform also rotates this offset.", type: 'vector3', default: spotLightDefaults.targetOffset },
        map: { type: 'string', default: spotLightDefaults.map },
    },
};

export default SpotLightComponent;
