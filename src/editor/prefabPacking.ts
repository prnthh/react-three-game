import { remapPrefabNodeIds, denormalizePrefab, getMaterialDefinition, scopePrefabMaterials, type PrefabState } from '../core/prefab.js';
import { findComponentEntry, type GameObject, type Prefab } from '../core/types.js';

/** Extract in placement-local coordinates and include referenced document material definitions. */
export function extractPrefab(state: PrefabState, id: string): Prefab {
    if (!Object.hasOwn(state.nodesById, id)) throw new Error(`Node "${id}" does not exist.`);
    const prefab = denormalizePrefab({ ...state, rootId: id });

    const definitions = new Set<string>();
    const collect = (node: GameObject) => {
        for (const component of Object.values(node.components ?? {})) {
            if (component?.type === 'Material' && getMaterialDefinition(component.properties)) definitions.add(component.properties.name);
        }
        node.children?.forEach(collect);
    };
    collect(prefab.root);
    const include = (node: GameObject) => {
        for (const component of Object.values(node.components ?? {})) {
            if (component?.type !== 'Material') continue;
            const id = component.properties.name;
            if (!id || definitions.has(id) || !state.materials[id]) continue;
            component.properties = { ...structuredClone(state.materials[id]), ...component.properties };
            definitions.add(id);
        }
        node.children?.forEach(include);
    };
    include(prefab.root);
    prefab.id = id;
    prefab.name = prefab.root.name ?? id;
    const transform = findComponentEntry(prefab.root, 'Transform');
    if (transform) delete prefab.root.components![transform[0]];
    delete prefab.root.hidden;
    delete prefab.root.disabled;
    delete prefab.root.locked;
    return prefab;
}

export function assertPackableNode(state: PrefabState, id: string) {
    if (id === state.rootId) throw new Error('Pack a child node, not the scene root.');
    const node = state.nodesById[id];
    if (!node) throw new Error(`Node "${id}" does not exist.`);
    if (findComponentEntry(node, 'PrefabRef') || node.packed) throw new Error('Node is already packed or a prefab reference.');
}

/** Keep the placement wrapper: flattening transforms can introduce shear and lose components. */
export function unpackPrefabNode(placement: GameObject, prefab: Prefab, scope: string) {
    const ref = findComponentEntry(placement, 'PrefabRef');
    if (!ref) throw new Error('Node has no PrefabRef component.');
    const scoped = scopePrefabMaterials(prefab, scope);
    const node = structuredClone(placement);
    delete node.components![ref[0]];
    node.children = [remapPrefabNodeIds(scoped.root, id => `${scope}/${id}`), ...(node.children ?? [])];
    return node;
}
