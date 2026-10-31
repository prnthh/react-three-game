import type { Object3D } from 'three';
import type { NodeComponentRegistry, NodeComponentType, PrefabRegistry } from './SceneContext.js';

import type { GameObjectHandle } from '../../core/componentContext.js';
export type { GameObjectHandle } from '../../core/componentContext.js';

export function scopedNodeId(prefix: string, nodeId: string) {
    return prefix ? `${prefix}/${nodeId}` : nodeId;
}

export function createGameObjectHandle(nodeId: string, prefix: string, objects: PrefabRegistry, components: NodeComponentRegistry): GameObjectHandle {
    const id = scopedNodeId(prefix, nodeId);
    return {
        id,
        nodeId,
        scope: prefix,
        get transform() { return objects.getObject(nodeId); },
        getComponent: type => components.get(id, type),
    };
}

const owners = new WeakMap<Object3D, { handle: GameObjectHandle }>();
const renderSources = new WeakMap<Object3D, { sources: readonly Object3D[] }>();

/** Associate a node root with its live handle. Descendants inherit the nearest owner. */
export function registerGameObjectOwner(object: Object3D, handle: GameObjectHandle) {
    const registration = { handle };
    owners.set(object, registration);
    return () => { if (owners.get(object) === registration) owners.delete(object); };
}

/** Preserve source identity when multiple game objects share a generated render batch. */
export function registerRenderSources(batch: Object3D, sources: readonly Object3D[]) {
    const registration = { sources: [...sources] };
    renderSources.set(batch, registration);
    return () => { if (renderSources.get(batch) === registration) renderSources.delete(batch); };
}

export function resolveRenderSource(object: Object3D, instanceId?: number): Object3D | null {
    const registration = renderSources.get(object);
    if (!registration) return object;
    // A generated batch has no single source owner without a valid instance index.
    if (instanceId == null || !Number.isInteger(instanceId)) return null;
    return registration.sources[instanceId] ?? null;
}

/** Resolve ordinary meshes, imported descendants, and instanced hits to a live game object. */
export function resolveGameObject(object: Object3D, instanceId?: number): GameObjectHandle | null {
    let current = resolveRenderSource(object, instanceId);
    while (current) {
        const handle = owners.get(current)?.handle;
        if (handle) return handle;
        current = current.parent;
    }
    return null;
}

/** Direct node identity for document-aware consumers such as editor selection. */
export function getObjectNodeIdentity(object: Object3D): { id: string; nodeId: string; scope: string } | null {
    const handle = owners.get(object)?.handle;
    return handle ? { id: handle.id, nodeId: handle.nodeId, scope: handle.scope } : null;
}
