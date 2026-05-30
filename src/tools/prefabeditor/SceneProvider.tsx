import { useContext, useMemo, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { useStore } from "zustand";
import type { Camera, Object3D, WebGLRenderer } from "three";

import { PrefabEditorMode, SceneContext } from "./SceneContext";
import type { Scene } from "./SceneContext";
import { useAssetRuntime } from "./assetRuntime";
import type { PrefabStoreApi } from "./prefabStore";

export interface SceneProviderProps {
    store: PrefabStoreApi;
    editMode?: boolean;
    basePath?: string;
    children: ReactNode;
}

/**
 * Recursive provider: if a Scene is already present above, this is a
 * pass-through. Otherwise this layer becomes the owner and builds a default
 * Scene bound to the given store + asset runtime.
 */
export function SceneProvider({ store, editMode, basePath = "", children }: SceneProviderProps) {
    const inherited = useContext(SceneContext);
    if (inherited !== null) return <>{children}</>;
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
        getModel: runtime.getModel,
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
            void precompile(model, renderer, camera).then(() => runtime.registerModel(path, model));
        },
        addTexture: runtime.registerTexture,
        addSound: runtime.registerSound,
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
