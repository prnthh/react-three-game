import type { Object3D } from 'three';
import type { NodeComponentRegistry, NodeComponentType, PrefabRegistry } from './SceneContext.js';

/** Live state only: changes are neither serialized nor undoable. Reads follow mounting, replacement and unloading. */
export interface GameObjectHandle {
    /** Scene-wide game-object identity, independent of the Three object UUID. */
    readonly id: string;
    readonly nodeId: string;
    readonly scope: string;
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
    if (handle) return { id: handle.id, nodeId: handle.nodeId, scope: handle.scope };
    // Retain support for externally supplied prefab objects carrying authored metadata.
    const nodeId = object.userData.prefabNodeId;
    const scope = object.userData.prefabNodeScope ?? '';
    return typeof nodeId === 'string' && typeof scope === 'string'
        ? { id: scopedNodeId(scope, nodeId), nodeId, scope } : null;
}
