import { Group, Vector3 } from 'three';
import { useStore } from '@react-three/fiber';
import { CascadedDirectionalLight } from '../lighting/CascadedDirectionalLight.js';
import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";

import { subscribeFrame } from '../scene/frame.js';

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";

import { Object3D } from "three";

import type { DirectionalLight } from "three";

import { createNodeComponentType, useNode, useRegisterNodeComponent } from "../scene/SceneContext.js";

import { createFollowState, stepCameraFollow, EditorLightGizmo, ShadowCameraHelper, shadowDefaults, shadowProps, useShadowMapResolution } from "./lightUtils.js";

export const DIRECTIONAL_LIGHT_COMPONENT = createNodeComponentType<RefObject<DirectionalLight | null>>('DirectionalLight');

export const directionalLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    ...shadowDefaults,
    followCamera: false,
    followCameraStep: 8,
    followCameraInterval: 0.25,
    shadowCascades: 1,
    shadowDistance: 100,
    shadowCameraLayers: 1,
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
    const lightProps = {
        color: properties.color,
        intensity: properties.intensity,
        ...shadowProps(properties),
        "shadow-camera-layers-mask": properties.shadowCameraLayers,
        "shadow-camera-top": properties.shadowCameraTop,
        "shadow-camera-bottom": properties.shadowCameraBottom,
        "shadow-camera-left": properties.shadowCameraLeft,
        "shadow-camera-right": properties.shadowCameraRight,
    };
    const directionalLightRef = useRef<DirectionalLight>(null);
    useRegisterNodeComponent(DIRECTIONAL_LIGHT_COMPONENT, directionalLightRef);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(directionalLightRef, properties.shadowMapSize);
    const rig = useRef<Group>(null);
    const store = useStore();
    const { followCamera, followCameraInterval, followCameraStep } = properties;
    useLayoutEffect(() => {
        rig.current?.position.set(0, 0, 0);
        if (directionalLightRef.current) directionalLightRef.current.shadow.needsUpdate = true;
        if (!followCamera) return;
        const follow = createFollowState(), cameraPosition = new Vector3(), offset = new Vector3();
        return subscribeFrame(store, ({ camera }, delta) => {
            const root = rig.current;
            if (!root) return;
            camera.getWorldPosition(cameraPosition);
            if (!stepCameraFollow(follow, delta, cameraPosition.x, cameraPosition.z,
                Math.max(0.01, followCameraInterval), Math.max(0.01, followCameraStep))) return;
            if (root.parent) {
                root.parent.getWorldPosition(offset);
                offset.x += follow.x;
                offset.z += follow.z;
                root.parent.worldToLocal(offset);
            } else offset.set(follow.x, 0, follow.z);
            root.position.copy(offset);
            if (directionalLightRef.current) directionalLightRef.current.shadow.needsUpdate = true;
        });
    }, [store, followCamera, followCameraInterval, followCameraStep]);

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

            {editMode && isSelected && properties.castShadow && <ShadowCameraHelper
                key={`${properties.shadowCascades}/${properties.shadowDistance}`} light={directionalLightRef} />}
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
