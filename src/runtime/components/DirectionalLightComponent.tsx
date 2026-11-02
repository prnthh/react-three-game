import { Group, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { CascadedDirectionalLight } from '../lighting/CascadedDirectionalLight.js';
import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";

import { useHelper } from "@react-three/drei";

import { useLayoutEffect, useMemo, useRef } from "react";

import { CameraHelper, Object3D } from "three";

import type { DirectionalLight } from "three";

import { useNode } from "../scene/SceneContext.js";

import { createFollowState, stepCameraFollow, EditorLightGizmo, normalizeShadowMapSize, useShadowMapResolution } from "./lightUtils.js";

export const directionalLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    followCamera: false,
    followCameraStep: 8,
    followCameraInterval: 0.25,
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowIntensity: 1,
    shadowRadius: 1,
    shadowAutoUpdate: true,
    shadowCascades: 1,
    shadowDistance: 100,
    shadowCameraLayers: 1,
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
    const editMode = useNode(node => node.editMode);
    const isSelected = useNode(node => node.isSelected);
    const shadowMapSize = normalizeShadowMapSize(properties.shadowMapSize);
    const lightProps = {
        color: properties.color,
        intensity: properties.intensity,
        castShadow: properties.castShadow,
        "shadow-bias": properties.shadowBias,
        "shadow-normalBias": properties.shadowNormalBias,
        "shadow-intensity": properties.shadowIntensity,
        "shadow-radius": properties.shadowRadius,
        "shadow-autoUpdate": properties.shadowAutoUpdate,
        "shadow-camera-layers-mask": properties.shadowCameraLayers,
        "shadow-camera-near": properties.shadowCameraNear,
        "shadow-camera-far": properties.shadowCameraFar,
        "shadow-camera-top": properties.shadowCameraTop,
        "shadow-camera-bottom": properties.shadowCameraBottom,
        "shadow-camera-left": properties.shadowCameraLeft,
        "shadow-camera-right": properties.shadowCameraRight,
    };
    const directionalLightRef = useRef<DirectionalLight>(null);
    const helperTargetRef = useRef<Object3D>(null!);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(directionalLightRef, shadowMapSize);
    const rig = useRef<Group>(null);
    const follow = useMemo(createFollowState, [properties.followCamera, properties.followCameraStep, properties.followCameraInterval]);
    const cameraPosition = useMemo(() => new Vector3(), []);
    const offset = useMemo(() => new Vector3(), []);
    useLayoutEffect(() => {
        rig.current?.position.set(0, 0, 0);
        if (directionalLightRef.current) directionalLightRef.current.shadow.needsUpdate = true;
    }, [follow]);
    useFrame(({ camera }, delta) => {
        const root = rig.current;
        if (!properties.followCamera || !root) return;
        camera.getWorldPosition(cameraPosition);
        if (!stepCameraFollow(follow, delta, cameraPosition.x, cameraPosition.z,
            Math.max(0.01, properties.followCameraInterval), Math.max(0.01, properties.followCameraStep))) return;
        // Move light and target together in world X/Z; keep authored height and direction.
        if (root.parent) {
            root.parent.getWorldPosition(offset);
            offset.x += follow.x;
            offset.z += follow.z;
            root.parent.worldToLocal(offset);
        } else offset.set(follow.x, 0, follow.z);
        root.position.copy(offset);
        if (directionalLightRef.current) directionalLightRef.current.shadow.needsUpdate = true;
    });

    // Show CameraHelper only in edit mode, selected, and castShadow
    const showHelper = editMode && isSelected && properties.castShadow;
    const shadowCamera = directionalLightRef.current?.shadow.camera ?? null;
    if (shadowCamera) helperTargetRef.current = shadowCamera;
    useHelper(showHelper && shadowCamera ? helperTargetRef : null, CameraHelper);

    const Light = properties.castShadow && properties.shadowCascades > 1 ? CascadedDirectionalLight : 'directionalLight';
    const cascadeProps = Light === CascadedDirectionalLight
        ? { cascades: properties.shadowCascades, maxFar: properties.shadowDistance } : {};
    return (
        <group ref={rig}>
            <Light
                {...cascadeProps}
                ref={directionalLightRef}
                {...lightProps}
                target={target}
            >
                {children}
                {editMode ? (
                    <EditorLightGizmo
                        color={properties.color}
                        selected={isSelected}
                        targetOffset={properties.targetOffset}
                    />
                ) : null}
                {editMode && isSelected && (
                    <>
                        {/* Target indicator */}
                        <mesh position={properties.targetOffset}>
                            <sphereGeometry args={[0.2, 8, 6]} />
                            <meshBasicMaterial color={properties.color} wireframe opacity={0.5} transparent />
                        </mesh>
                        {/* Direction line */}
                        <line>
                            <bufferGeometry>
                                <bufferAttribute
                                    attach="attributes-position"
                                    args={[new Float32Array([0, 0, 0, properties.targetOffset[0], properties.targetOffset[1], properties.targetOffset[2]]), 3]}
                                />
                            </bufferGeometry>
                            <lineBasicMaterial color={properties.color} opacity={0.6} transparent />
                        </line>
                    </>
                )}
            </Light>

            <primitive object={target} position={properties.targetOffset} />

        </group>
    );
}

const DirectionalLightComponent: Component<DirectionalLightProperties> = {
    name: 'DirectionalLight',
    renderWhenDisabled: true,
    description: "Add sunlight-like parallel rays aimed from this node toward targetOffset. Use castShadow and shadow camera bounds to cover the objects that need shadows.",
    category: 'lighting',
    View: DirectionalLightView,
    properties: {
        color: { type: 'color', default: directionalLightDefaults.color },
        intensity: { default: directionalLightDefaults.intensity },
        followCamera: { type: 'boolean', default: false, label: 'Follow camera', description: 'Translate the light and target with camera X/Z in timed grid steps; preserve authored height and direction.' },
        followCameraStep: { default: directionalLightDefaults.followCameraStep, min: 0.01, step: 1, description: 'Shared X/Z step size in world units when Follow camera is enabled.' },
        followCameraInterval: { default: directionalLightDefaults.followCameraInterval, min: 0.01, step: 0.05, description: 'Seconds between camera position samples when Follow camera is enabled.' },
        castShadow: { type: 'boolean', default: directionalLightDefaults.castShadow },
        shadowMapSize: { default: directionalLightDefaults.shadowMapSize },
        shadowBias: { default: directionalLightDefaults.shadowBias },
        shadowNormalBias: { default: directionalLightDefaults.shadowNormalBias },
        shadowIntensity: { default: directionalLightDefaults.shadowIntensity, min: 0, max: 1, step: 0.05 },
        shadowRadius: { default: directionalLightDefaults.shadowRadius, min: 0, step: 0.25 },
        shadowCascades: { default: 1, min: 1, max: 4, step: 1 },
        shadowDistance: { default: 100, min: 1 },
        shadowAutoUpdate: { type: 'boolean', default: directionalLightDefaults.shadowAutoUpdate },
        shadowCameraLayers: { default: 1, min: 0, step: 1, description: "Layer bitmask rendered into the shadow map." },
        shadowCameraNear: { default: directionalLightDefaults.shadowCameraNear },
        shadowCameraFar: { default: directionalLightDefaults.shadowCameraFar },
        shadowCameraTop: { default: directionalLightDefaults.shadowCameraTop },
        shadowCameraBottom: { default: directionalLightDefaults.shadowCameraBottom },
        shadowCameraLeft: { default: directionalLightDefaults.shadowCameraLeft },
        shadowCameraRight: { default: directionalLightDefaults.shadowCameraRight },
        targetOffset: { description: "Aim point relative to this node, in local scene units; the node transform also rotates this offset.", type: 'vector3', default: directionalLightDefaults.targetOffset },
    },
};

export default DirectionalLightComponent;
