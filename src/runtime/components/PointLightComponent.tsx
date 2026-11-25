import { useRef } from 'react';

import { Helper } from '@react-three/drei';

import { PointLightHelper } from 'three';

import type { PointLight } from 'three';

import { useNode } from '../scene/SceneContext.js';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

import { EditorLightGizmo, localLightDefaults, localLightProperties, shadowProps, useShadowMapResolution } from './lightUtils.js';

export const pointLightDefaults = localLightDefaults;

export type PointLightProperties = Partial<typeof pointLightDefaults>;

function PointLightView({ properties, children }: ComponentViewProps<PointLightProperties>) {
    const editMode = useNode(node => node.editMode);
    const isSelected = useNode(node => node.isSelected);
    const lightProps = {
        color: properties.color,
        intensity: properties.intensity,
        distance: properties.distance,
        decay: properties.decay,
        ...shadowProps(properties),
    };
    const lightRef = useRef<PointLight>(null!);
    useShadowMapResolution(lightRef, properties.shadowMapSize);
    const showHelper = editMode && isSelected;

    return (
        <pointLight ref={lightRef} {...lightProps}>
            {showHelper && <Helper type={PointLightHelper} args={[0.5]} />}
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
    );
}

const PointLightComponent: Component<PointLightProperties> = {
    name: 'PointLight',
    renderWhenDisabled: true,
    description: "Emit light in all directions from this node. Position with Transform; set distance for a finite range and castShadow when shadows are needed.",
    category: 'lighting',
    View: PointLightView,
    properties: {
        ...localLightProperties,
    },
};

export default PointLightComponent;
