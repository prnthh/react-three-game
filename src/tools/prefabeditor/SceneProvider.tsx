import { useContext, useMemo, useState, type ReactNode } from "react";

import { createPrefabRegistry, PrefabContext, PrefabEditorMode, PrefabRenderCacheProvider, SceneComponentsProvider, SceneContext } from "./SceneContext";
import type { PrefabApi, Scene } from "./SceneContext";
import { AssetRuntimeProvider, useAssetRuntime } from "./assetRuntime";
import { AudioRuntimeProvider } from "./AudioRuntime";
import { SelectionRuntimeProvider } from "./SelectionRuntime";
import { GeometryRuntimeProvider } from "./components/GeometryComponent";
import { MaterialPoolProvider, MaterialRuntimeProvider } from "./components/MaterialComponent";
import { MeshInstanceProvider } from "./MeshInstanceProvider";
import { PrefabStoreProvider, type PrefabStoreApi } from "./prefabStore";
import { withBasePath } from "./runtimeUtils";

export interface SceneProviderProps {
    store: PrefabStoreApi;
    scene?: Scene;
    prefab?: PrefabApi;
    editMode?: boolean;
    basePath?: string;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    children: ReactNode;
}

/** Owns a prefab document scope and creates the scene only at the outermost root. */
export function SceneProvider(props: SceneProviderProps) {
    return <PrefabStoreProvider store={props.store}>
        <SelectionRuntimeProvider selectedId={props.selectedId} select={props.onSelect}>
            <SceneProviderBody {...props} />
        </SelectionRuntimeProvider>
    </PrefabStoreProvider>;
}

function SceneProviderBody(props: SceneProviderProps) {
    const parentScene = useContext(SceneContext);

    if (parentScene) {
        return <PrefabScope {...props} parentScene={parentScene} />;
    }

    return <AssetRuntimeProvider>
        <AudioRuntimeProvider>
            <GeometryRuntimeProvider>
                <MaterialPoolProvider>
                    <SceneComponentsProvider>
                        <PrefabRenderCacheProvider>
                            <MeshInstanceProvider>
                                <PrefabScope {...props} parentScene={null} />
                            </MeshInstanceProvider>
                        </PrefabRenderCacheProvider>
                    </SceneComponentsProvider>
                </MaterialPoolProvider>
            </GeometryRuntimeProvider>
        </AudioRuntimeProvider>
    </AssetRuntimeProvider>;
}

function PrefabScope({ store, scene, prefab, editMode, basePath = "", children, parentScene }: SceneProviderProps & { parentScene: Scene | null }) {
    const runtime = useAssetRuntime();
    const [registry] = useState(createPrefabRegistry);

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
    const resolvedScene = useMemo<Scene>(() => parentScene ?? scene ?? ({
        get root() { return resolvedPrefab.root; },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
    }), [editMode, parentScene, resolvedPrefab, scene]);

    return <SceneContext.Provider value={resolvedScene}>
        <PrefabContext.Provider value={resolvedPrefab}>
            <MaterialRuntimeProvider>{children}</MaterialRuntimeProvider>
        </PrefabContext.Provider>
    </SceneContext.Provider>;
}
