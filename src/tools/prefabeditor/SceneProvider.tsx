import { useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { useStore } from "zustand";
import type { Camera, Object3D, WebGLRenderer } from "three";

import { PrefabEditorMode, SceneContext } from "./SceneContext";
import type { Scene } from "./SceneContext";
import { useAssetRuntime } from "./assetRuntime";
import type { PrefabStoreApi } from "./prefabStore";
import { withBasePath } from "./runtimeUtils";

export interface SceneProviderProps {
    store: PrefabStoreApi;
    scene?: Scene;
    editMode?: boolean;
    basePath?: string;
    children: ReactNode;
}

/**
 * Owns a Scene for one prefab store. Editors may inject their history-aware
 * Scene implementation; nested prefab roots otherwise receive an isolated
 * authored-data scope while still sharing the asset runtime.
 */
export function SceneProvider({ store, scene, editMode, basePath = "", children }: SceneProviderProps) {
    if (scene) {
        return <SceneContext.Provider value={scene}>{children}</SceneContext.Provider>;
    }
    return (
        <SceneOwner store={store} editMode={editMode} basePath={basePath}>
            {children}
        </SceneOwner>
    );
}

function SceneOwner({ store, editMode, basePath, children }: Required<Pick<SceneProviderProps, "store" | "basePath">> & Pick<SceneProviderProps, "editMode" | "children">) {
    const runtime = useAssetRuntime();
    const renderer = useThree(s => s.gl);
    const camera = useThree(s => s.camera);
    const rootId = useStore(store, s => s.rootId);

    const scene = useMemo<Scene>(() => ({
        get root() { return runtime.getObject(rootId); },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
        basePath,
        get: (id) => store.getState().nodesById[id] ?? null,
        getObject: runtime.getObject,
        getHandle: runtime.getHandle,
        getModel: (path) => runtime.getModel(withBasePath(basePath, path)),
        add: (node, parentId) => {
            const s = store.getState();
            s.addChild(parentId ?? s.rootId, node);
            return node;
        },
        update: (id, fn) => store.getState().updateNode(id, fn),
        replaceNode: (id, node) => store.getState().replaceNode(id, node),
        remove: (id) => store.getState().deleteNode(id),
        duplicate: (id) => store.getState().duplicateNode(id),
        move: (a, b, p) => store.getState().moveNode(a, b, p),
        replace: (p) => store.getState().replacePrefab(p),
        addModel: (path, model) => {
            void precompile(model, renderer, camera).then(() => runtime.registerModel(withBasePath(basePath, path), model));
        },
        addTexture: (path, texture) => runtime.registerTexture(withBasePath(basePath, path), texture),
        addSound: (path, sound) => runtime.registerSound(withBasePath(basePath, path), sound),
    }), [store, editMode, basePath, runtime, rootId, renderer, camera]);

    return <SceneContext.Provider value={scene}>{children}</SceneContext.Provider>;
}

async function precompile(model: Object3D, renderer: WebGLRenderer, camera: Camera) {
    try {
        await renderer.compileAsync(model, camera);
    } catch (error) {
        console.warn("Failed to precompile model before adding it to the scene", error);
    }
}
