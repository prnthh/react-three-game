import type { MeshProperties } from "./meshProperties.js";
import { useLayoutEffect, useRef } from 'react';

import type { Mesh } from 'three';

import type { ComponentViewProps } from '../../core/ComponentRegistry.js';

import { useGameObject, useNode } from '../scene/SceneContext.js';

import { useMeshInstanceRegistration, useInvalidateMeshInstances } from '../rendering/MeshInstanceProvider.js';

export function MeshNode({ properties, children }: ComponentViewProps<MeshProperties>) {
    const isSelected = useNode(node => node.isSelected);
    const { id: runtimeNodeId } = useGameObject();
    const mesh = useRef<Mesh>(null);
    const visible = properties.visible !== false;
    const invalidateInstances = useInvalidateMeshInstances();
    useLayoutEffect(() => invalidateInstances(), [invalidateInstances, properties.frustumCulled, properties.castShadow, properties.receiveShadow]);
    useMeshInstanceRegistration(
        runtimeNodeId,
        mesh,
        properties.instanced !== false && visible && !properties.emitClickEvent && !isSelected,
    );
    return (
        <mesh
            ref={mesh}
            visible={visible}
            frustumCulled={properties.frustumCulled !== false}
            castShadow={visible && properties.castShadow !== false}
            receiveShadow={visible && properties.receiveShadow !== false}
        >
            {children}
        </mesh>
    );
}
