import { useLayoutEffect, useRef } from 'react';

import type { Mesh } from 'three';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

import { useGameObject, useNode } from '../scene/SceneContext';

import { useMeshInstanceRegistration, useInvalidateMeshInstances } from '../rendering/MeshInstanceProvider';

export type MeshProperties = {
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    instanced?: boolean;
    frustumCulled?: boolean;
    emitClickEvent?: boolean;
    clickEventName?: string;
};

function MeshView({ properties, children }: ComponentViewProps<MeshProperties>) {
    const { isSelected } = useNode();
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

const MeshComponent: Component<MeshProperties> = {
    name: 'Mesh',
    description: 'Renderable mesh. Compatible shared geometry/materials instance automatically; keep instanced enabled for repeated pieces.',
    renderWhenDisabled: true,
    slot: 'object',
    View: MeshView,
    properties: {
        visible: { type: 'boolean', default: true },
        castShadow: { type: 'boolean', default: true },
        receiveShadow: { type: 'boolean', default: true },
        frustumCulled: { type: 'boolean', default: true, description: 'Cull outside each render camera using geometry bounds. Disable for custom vertex deformation without conservative bounds.' },
        instanced: { type: 'boolean', default: true, description: 'Allow automatic batching with matching geometry, material and shadow flags. Selection and click events can require separate meshes.' },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: '' },
    },
};

export default MeshComponent;
