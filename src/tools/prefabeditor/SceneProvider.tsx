import { useContext, useMemo, useState, type ReactNode } from "react";

import { createNodeComponentRegistry, createPrefabRegistry, NodeComponentContext, PrefabContext, PrefabEditorMode, SceneContext } from "./SceneContext";
import type { PrefabApi, Scene } from "./SceneContext";
import { useAssetRuntime } from "./assetRuntime";
import type { PrefabStoreApi } from "./prefabStore";
import { withBasePath } from "./runtimeUtils";

export interface SceneProviderProps {
    store: PrefabStoreApi;
    scene?: Scene;
    prefab?: PrefabApi;
    editMode?: boolean;
    basePath?: string;
    children: ReactNode;
}

/** Owns a prefab document scope and creates the scene only at the outermost root. */
export function SceneProvider({ store, scene, prefab, editMode, basePath = "", children }: SceneProviderProps) {
    const parentScene = useContext(SceneContext);
    const parentComponents = useContext(NodeComponentContext);
    const runtime = useAssetRuntime();
    const [registry] = useState(createPrefabRegistry);
    const [components] = useState(() => parentComponents ?? createNodeComponentRegistry());

    const localPrefab = useMemo<PrefabApi>(() => ({
        ...registry,
        get root() { return registry.getObject(store.getState().rootId); },
        basePath,
        get: (id) => store.getState().nodesById[id] ?? null,
        getModel: (path) => runtime.getModel(withBasePath(basePath, path)),
        getMaterial: (id) => store.getState().materials[id] ?? null,
        add: (node, parentId) => {
            const s = store.getState();
            s.addChild(parentId ?? s.rootId, node);
            return node;
        },
        update: (id, fn) => store.getState().updateNode(id, fn),
        setMaterial: (id, material) => store.getState().setMaterial(id, material),
        replaceNode: (id, node) => store.getState().replaceNode(id, node),
        remove: (id) => store.getState().deleteNode(id),
        duplicate: (id) => store.getState().duplicateNode(id),
        move: (a, b, p) => store.getState().moveNode(a, b, p),
        replace: (p) => store.getState().replacePrefab(p),
        addModel: (path, model) => runtime.registerModel(withBasePath(basePath, path), model),
        addTexture: (path, texture) => runtime.registerTexture(withBasePath(basePath, path), texture),
        addSound: (path, sound) => runtime.registerSound(withBasePath(basePath, path), sound),
    }), [basePath, registry, runtime, store]);
    const resolvedPrefab = prefab ?? localPrefab;
    const localScene = useMemo<Scene>(() => ({
        get root() { return resolvedPrefab.root; },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
    }), [editMode, resolvedPrefab]);
    const resolvedScene = parentScene ?? scene ?? localScene;

    return <SceneContext.Provider value={resolvedScene}>
        <NodeComponentContext.Provider value={components}>
            <PrefabContext.Provider value={resolvedPrefab}>{children}</PrefabContext.Provider>
        </NodeComponentContext.Provider>
    </SceneContext.Provider>;
}
