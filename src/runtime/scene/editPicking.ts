import type { Intersection, Object3D } from 'three';
import type { GameObject } from '../../core/types.js';

import { getObjectNodeIdentity, registerRenderSources, resolveRenderSource } from './gameObject.js';

/** @deprecated Render-source identity is shared by runtime and editor consumers. */
export const registerEditPickSources = registerRenderSources;

export function editPickObject(hit: Pick<Intersection, 'object' | 'instanceId'>): Object3D | null {
    return resolveRenderSource(hit.object, hit.instanceId);
}

export function editPickIds(hits: Pick<Intersection, 'object' | 'instanceId'>[], nodes: Record<string, GameObject>, scope = '') {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
        let object: Object3D | null = editPickObject(hit);
        while (object) {
            const identity = getObjectNodeIdentity(object);
            const id = identity?.nodeId;
            // Source-local IDs can equal an outer placement ID. Only the owning
            // document's nodes are candidates; otherwise climb to its placement.
            const node = identity?.scope === scope && typeof id === 'string' ? nodes[id] : null;
            if (node && !node.locked && id !== undefined) {
                if (!seen.has(id)) { seen.add(id); ids.push(id); }
                break;
            }
            object = object.parent;
        }
    }
    return ids;
}
