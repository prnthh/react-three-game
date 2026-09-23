import { useState } from 'react';

import type { Mesh } from 'three';

import type { Component, ComponentViewProps } from './ComponentRegistry';

import { useGameObject, useNode } from '../SceneContext';

import { useMeshInstanceRegistration } from '../MeshInstanceProvider';

export type MeshProperties = {
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    instanced?: boolean;
    emitClickEvent?: boolean;
    clickEventName?: string;
};

function MeshView({ properties, children }: ComponentViewProps<MeshProperties>) {
    const { isSelected } = useNode();
    const { id: runtimeNodeId } = useGameObject();
    const [mesh, setMesh] = useState<Mesh | null>(null);
    const visible = properties.visible !== false;
    useMeshInstanceRegistration(
        runtimeNodeId,
        mesh,
        properties.instanced !== false && visible && !properties.emitClickEvent && !isSelected,
    );
    return (
        <mesh
            ref={setMesh}
            visible={visible}
            castShadow={visible && properties.castShadow !== false}
            receiveShadow={visible && properties.receiveShadow !== false}
        >
            {children}
        </mesh>
    );
}

const MeshComponent: Component<MeshProperties> = {
    name: 'Mesh',
    renderWhenDisabled: true,
    slot: 'object',
    View: MeshView,
    properties: {
        visible: { type: 'boolean', default: true },
        castShadow: { type: 'boolean', default: true },
        receiveShadow: { type: 'boolean', default: true },
        instanced: { type: 'boolean', default: true },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: '' },
    },
};

export default MeshComponent;
