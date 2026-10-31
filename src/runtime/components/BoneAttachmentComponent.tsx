import { Fragment, useMemo } from 'react';
import { createPortal } from '@react-three/fiber';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { usePrefabStore } from '../prefabs/PrefabStoreContext.js';
import { useGameObject, useSceneComponents } from '../scene/SceneContext.js';
import { SKINNED_MESH_COMPONENT } from './SkinnedMeshComponent.js';

export type BoneAttachmentProperties = {
    targetId: string;
    bone: string;
};

function BoneAttachmentView({ properties, children }: ComponentViewProps<BoneAttachmentProperties>) {
    const owner = useGameObject();
    const target = useGameObject(properties.targetId.trim());
    const validTarget = usePrefabStore(state => {
        let id: string | null | undefined = target.nodeId;
        while (id) {
            if (id === owner.nodeId) return false;
            id = state.parentIdById[id];
        }
        return !!state.nodesById[target.nodeId];
    });
    // Registry subscriptions also cover async loading, replacement and unloading.
    const models = useSceneComponents(SKINNED_MESH_COMPONENT);
    const model = models.find(entry => entry.key === target.id)?.value;
    const bone = useMemo(() => {
        if (!model || !validTarget || !properties.bone) return null;
        return model.getBone(properties.bone);
    }, [model, properties.bone, validTarget]);
    // A changed container alone retains R3F's previous portal store. Remount on
    // bone identity, without taking ownership of the cached model or skeleton.
    return bone ? <Fragment key={bone.uuid}>{createPortal(children, bone)}</Fragment> : null;
}

const BoneAttachmentComponent: Component<BoneAttachmentProperties> = {
    name: 'BoneAttachment',
    category: 'transform',
    exclusive: 'attachment',
    renderWhenDisabled: true,
    description: 'Attach child content to a bone of another node’s SkinnedMesh. Put Transform and Model or Geometry on a child equipment node for bone-local grip offsets. This parent node stays in its original hierarchy; missing models/bones hide the attached content until available.',
    View: BoneAttachmentView,
    properties: {
        targetId: { type: 'string', default: '', description: 'SkinnedMesh node ID in this prefab instance. Must be another node, not this attachment or one of its children.' },
        bone: { type: 'string', default: '', description: 'Exact imported bone name, for example mixamorigRightHand. Children inherit the bone’s animation and scale.' },
    },
};
export default BoneAttachmentComponent;
