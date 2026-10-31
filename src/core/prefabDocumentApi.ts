import type { GameObject, Prefab, PrefabMaterial } from './types.js';
import type { PrefabNodeRecord } from './prefab.js';
import type { PrefabStoreApi } from './prefabStore.js';

/** Serializable authored state. Reads are immutable snapshots; edits use these methods. */
export interface PrefabDocumentApi {
    get(id: string): GameObject | null;
    getMaterial(id: string): PrefabMaterial | null;
    /** Apply synchronous document edits atomically, with one subscription update. */
    batch(action: () => void): void;
    add(node: GameObject, parentId?: string): GameObject;
    update(id: string, fn: (node: PrefabNodeRecord) => PrefabNodeRecord): void;
    replaceNode(id: string, node: GameObject): void;
    remove(id: string): void;
    duplicate(id: string): string | null;
    move(draggedId: string, targetId: string, position: "before" | "inside"): void;
    replace(prefab: Prefab): void;
}

/** Document mutations are independent of mounted objects, assets and rendering. */
export function createPrefabDocumentApi(store: PrefabStoreApi): PrefabDocumentApi {
    return {
        get: id => store.getState().nodesById[id] ?? null,
        getMaterial: id => store.getState().materials[id] ?? null,
        batch: action => store.getState().batch(action),
        add: (node, parentId) => {
            const state = store.getState();
            state.addChild(parentId ?? state.rootId, node);
            return node;
        },
        update: (id, fn) => store.getState().updateNode(id, fn),
        replaceNode: (id, node) => store.getState().replaceNode(id, node),
        remove: id => store.getState().deleteNode(id),
        duplicate: id => store.getState().duplicateNode(id),
        move: (a, b, position) => store.getState().moveNode(a, b, position),
        replace: prefab => store.getState().replacePrefab(prefab),
    };
}

/** Give an inline material a persisted reference ID without copying its settings to consumers. */
export function ensureMaterialReference(document: Pick<PrefabDocumentApi, 'get' | 'update'>, nodeId: string, componentKey: string): string {
    const component = document.get(nodeId)?.components?.[componentKey];
    if (component?.type !== 'Material') throw new Error('The source material no longer exists.');
    if (component.properties.name) return component.properties.name;
    const id = crypto.randomUUID();
    document.update(nodeId, node => ({ ...node, components: { ...node.components,
        [componentKey]: { ...component, properties: { ...component.properties, materialType: component.properties.materialType ?? 'standard', name: id } },
    } }));
    return id;
}
