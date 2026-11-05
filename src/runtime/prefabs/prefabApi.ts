import { useMemo } from 'react';
import type { PrefabApi, PrefabRegistry } from '../scene/SceneContext.js';
import { usePrefabStoreApi } from "./PrefabStoreContext.js";
import { type PrefabStoreApi } from "../../core/prefabStore.js";

import { createPrefabDocumentApi, type PrefabDocumentApi } from '../../core/prefabDocumentApi.js';

/** Use for authored edits; useGameObject accesses transient runtime state. */
export function usePrefabDocument(): PrefabDocumentApi {
    const store = usePrefabStoreApi();
    return useMemo(() => createPrefabDocumentApi(store), [store]);
}

/** Runtime access stays separate from the serializable document API. */
export function createPrefabApi(store: PrefabStoreApi, registry: PrefabRegistry, basePath: string): PrefabApi {
    return {
        ...registry,
        get root() { return registry.getObject(store.getState().rootId); },
        basePath,
    };
}
