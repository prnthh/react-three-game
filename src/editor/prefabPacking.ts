import { denormalizePrefab, getMaterialDefinition, scopePrefabMaterials, type PrefabState } from '../core/prefab.js';
import { encodePrefabSource } from '../runtime/prefabs/prefabSource.js';
import { findComponentEntry, type GameObject, type Prefab } from '../core/types.js';

/** Extract in placement-local coordinates and include referenced document material definitions. */
export function extractPrefab(state: PrefabState, id: string): Prefab {
    if (!Object.hasOwn(state.nodesById, id)) throw new Error(`Node "${id}" does not exist.`);
    const prefab = structuredClone(denormalizePrefab({ ...state, rootId: id }));
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

export function packPrefabNode(state: PrefabState, id: string) {
    if (id === state.rootId) throw new Error('Pack a child node, not the scene root.');
    const prefab = extractPrefab(state, id);
    const original = state.nodesById[id];
    if (findComponentEntry(original, 'PrefabRef')) throw new Error('Node is already a prefab reference.');
    const transform = findComponentEntry(original, 'Transform');
    const refKey = transform?.[0] === 'prefabref' ? 'packedPrefab' : 'prefabref';
    const node: GameObject = {
        ...structuredClone(original),
        components: {
            ...(transform ? { [transform[0]]: structuredClone(transform[1]) } : {}),
            [refKey]: { type: 'PrefabRef', properties: {
                url: encodePrefabSource(prefab),
            } },
        },
    };
    return { node, prefab };
}

/** Keep the placement wrapper: flattening transforms can introduce shear and lose components. */
export function unpackPrefabNode(placement: GameObject, prefab: Prefab, scope: string) {
    const ref = findComponentEntry(placement, 'PrefabRef');
    if (!ref) throw new Error('Node has no PrefabRef component.');
    const scoped = scopePrefabMaterials(structuredClone(prefab), scope);
    const rename = (node: GameObject): GameObject => ({
        ...node, id: `${scope}/${node.id}`, children: node.children?.map(rename),
    });
    const node = structuredClone(placement);
    delete node.components![ref[0]];
    node.children = [rename(scoped.root), ...(node.children ?? [])];
    return { node };
}
