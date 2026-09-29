import type { Intersection, Object3D } from 'three';
import type { GameObject } from './types';

const instanceSources = new WeakMap<Object3D, Object3D[]>();

export function registerEditPickSources(batch: Object3D, sources: Object3D[]) {
    instanceSources.set(batch, sources);
    return () => { instanceSources.delete(batch); };
}

/** A rendered instance retains the source object's document ancestry for picking. */
export function editPickObject(hit: Pick<Intersection, 'object' | 'instanceId'>): Object3D {
    return hit.instanceId == null ? hit.object
        : instanceSources.get(hit.object)?.[hit.instanceId] ?? hit.object;
}

export function editPickIds(hits: Pick<Intersection, 'object' | 'instanceId'>[], nodes: Record<string, GameObject>) {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
        let object: Object3D | null = editPickObject(hit);
        while (object) {
            const id = object.userData.prefabNodeId;
            const node = typeof id === 'string' ? nodes[id] : null;
            if (node && !node.locked) {
                if (!seen.has(id)) { seen.add(id); ids.push(id); }
                break;
            }
            object = object.parent;
        }
    }
    return ids;
}
