import type { AssetRuntime } from './assetRuntime';
import type { PrefabApi, PrefabRegistry } from './SceneContext';
import type { PrefabStoreApi } from './prefabStore';
import { withBasePath } from './runtimeUtils';

/** The same document API is used by the viewer and editor. */
export function createPrefabApi(store: PrefabStoreApi, registry: PrefabRegistry, getRuntime: () => AssetRuntime | null, basePath: string): PrefabApi {
    return {
        ...registry,
        get root() { return registry.getObject(store.getState().rootId); },
        basePath,
        get: id => store.getState().nodesById[id] ?? null,
        getModel: path => getRuntime()?.getModel(withBasePath(basePath, path)) ?? null,
        getMaterial: id => store.getState().materials[id] ?? null,
        add: (node, parentId) => {
            const state = store.getState();
            state.addChild(parentId ?? state.rootId, node);
            return node;
        },
        update: (id, fn) => store.getState().updateNode(id, fn),
        setMaterial: (id, material) => store.getState().setMaterial(id, material),
        replaceNode: (id, node) => store.getState().replaceNode(id, node),
        remove: id => store.getState().deleteNode(id),
        duplicate: id => store.getState().duplicateNode(id),
        move: (a, b, position) => store.getState().moveNode(a, b, position),
        replace: prefab => store.getState().replacePrefab(prefab),
        addModel: (path, model) => getRuntime()?.registerModel(withBasePath(basePath, path), model),
        addTexture: (path, texture) => getRuntime()?.registerTexture(withBasePath(basePath, path), texture),
        addSound: (path, sound) => getRuntime()?.registerSound(withBasePath(basePath, path), sound),
    };
}
