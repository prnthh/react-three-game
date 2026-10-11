import { Color, Group, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { CascadedDirectionalLight } from '../lighting/CascadedDirectionalLight.js';
import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";

import { useHelper } from "@react-three/drei";

import { useLayoutEffect, useMemo, useRef } from "react";

import { CameraHelper, Object3D } from "three";

import type { DirectionalLight } from "three";

import { useNode } from "../scene/SceneContext.js";

import { createFollowState, stepCameraFollow, EditorLightGizmo, mergeWithDefaults, normalizeShadowMapSize, useShadowMapResolution } from "./lightUtils.js";

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
    const merged = mergeWithDefaults(directionalLightDefaults, properties);
    const shadowMapSize = normalizeShadowMapSize(merged.shadowMapSize);
    const lightProps = {
        color: new Color(merged.color),
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
    const rig = useRef<Group>(null);
    const follow = useMemo(createFollowState, [merged.followCamera, merged.followCameraStep, merged.followCameraInterval]);
    const cameraPosition = useMemo(() => new Vector3(), []);
    const offset = useMemo(() => new Vector3(), []);
    useLayoutEffect(() => {
        rig.current?.position.set(0, 0, 0);
        if (directionalLightRef.current) directionalLightRef.current.shadow.needsUpdate = true;
    }, [follow]);
    useFrame(({ camera }, delta) => {
        const root = rig.current;
        if (!merged.followCamera || !root) return;
        camera.getWorldPosition(cameraPosition);
        if (!stepCameraFollow(follow, delta, cameraPosition.x, cameraPosition.z,
            Math.max(0.01, merged.followCameraInterval), Math.max(0.01, merged.followCameraStep))) return;
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
    const showHelper = editMode && isSelected && merged.castShadow;
    const shadowCamera = directionalLightRef.current?.shadow.camera ?? null;
    if (shadowCamera) helperTargetRef.current = shadowCamera;
    useHelper(showHelper && shadowCamera ? helperTargetRef : null, CameraHelper);

    const Light = merged.castShadow && merged.shadowCascades > 1 ? CascadedDirectionalLight : 'directionalLight';
    const cascadeProps = Light === CascadedDirectionalLight
        ? { cascades: merged.shadowCascades, maxFar: merged.shadowDistance } : {};
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
                        color={merged.color}
                        selected={isSelected}
                        targetOffset={merged.targetOffset}
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
