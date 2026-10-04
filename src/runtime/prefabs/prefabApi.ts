import { useMemo } from 'react';
import type { AssetRuntime } from '../assets/AssetRuntime.js';
import type { PrefabApi, PrefabRegistry } from '../scene/SceneContext.js';
import { usePrefabStoreApi } from "./PrefabStoreContext.js";
import { type PrefabStoreApi } from "../../core/prefabStore.js";
import { withBasePath } from "../assets/assetPaths.js";

import { createPrefabDocumentApi, type PrefabDocumentApi } from '../../core/prefabDocumentApi.js';

/** Use for authored edits; useGameObject accesses transient runtime state. */
export function usePrefabDocument(): PrefabDocumentApi {
    const store = usePrefabStoreApi();
    return useMemo(() => createPrefabDocumentApi(store), [store]);
}

/** Existing refs combine the document facade with live objects and resources. */
export function createPrefabApi(store: PrefabStoreApi, registry: PrefabRegistry, getRuntime: () => AssetRuntime | null, basePath: string): PrefabApi {
    return {
        ...createPrefabDocumentApi(store),
        ...registry,
        get root() { return registry.getObject(store.getState().rootId); },
        basePath,
        getModel: path => getRuntime()?.getModel(withBasePath(basePath, path)) ?? null,
        addModel: (path, model) => getRuntime()?.registerModel(withBasePath(basePath, path), model),
        addTexture: (path, texture) => getRuntime()?.registerTexture(withBasePath(basePath, path), texture),
        addSound: (path, sound) => getRuntime()?.registerSound(withBasePath(basePath, path), sound),
    };
}
