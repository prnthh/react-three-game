import type { Object3D } from 'three';
import type { NodeComponentRegistry, NodeComponentType, PrefabRegistry } from './SceneContext';

/** Live state only: changes are neither serialized nor undoable. Reads follow mounting, replacement and unloading. */
export interface GameObjectHandle {
    readonly id: string;
    readonly transform: Object3D | null;
    getComponent<T>(type: NodeComponentType<T>): T | null;
}

export function scopedNodeId(prefix: string, nodeId: string) {
    return prefix ? `${prefix}/${nodeId}` : nodeId;
}

export function createGameObjectHandle(nodeId: string, prefix: string, objects: PrefabRegistry, components: NodeComponentRegistry): GameObjectHandle {
    const id = scopedNodeId(prefix, nodeId);
    return {
        id,
        get transform() { return objects.getObject(nodeId); },
        getComponent: type => components.get(id, type),
    };
}
