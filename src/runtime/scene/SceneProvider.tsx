import { useContext, useMemo, useState, type ReactNode } from "react";

import { createPrefabRegistry, PrefabContext, PrefabEditorMode, SceneContext } from "./SceneContext.js";
import type { PrefabApi, Scene } from "./SceneContext.js";
import { useAssetRuntime } from "../assets/AssetRuntime.js";
import { SelectionRuntimeProvider } from "./SelectionRuntime.js";
import { PrefabStoreProvider } from "../prefabs/PrefabStoreContext.js";
import { type PrefabStoreApi } from "../../core/prefabStore.js";
import { SceneRuntime } from "../SceneRuntime.js";
import { createPrefabApi } from "../prefabs/prefabApi.js";

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
    return <SceneRuntime>
        <PrefabStoreProvider store={props.store}>
            <SelectionRuntimeProvider selectedId={props.selectedId} select={props.onSelect}>
                <PrefabScope {...props} />
            </SelectionRuntimeProvider>
        </PrefabStoreProvider>
    </SceneRuntime>;
}

function PrefabScope({ store, scene, prefab, editMode, basePath = "", children }: SceneProviderProps) {
    const parentScene = useContext(SceneContext);
    const runtime = useAssetRuntime();
    const [registry] = useState(createPrefabRegistry);

    const localPrefab = useMemo(() => createPrefabApi(store, registry, () => runtime, basePath), [basePath, registry, runtime, store]);
    const resolvedPrefab = prefab ?? localPrefab;
    const resolvedScene = useMemo<Scene>(() => parentScene ?? scene ?? ({
        get root() { return resolvedPrefab.root; },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
    }), [editMode, parentScene, resolvedPrefab, scene]);

    const content = <PrefabContext.Provider value={resolvedPrefab}>{children}</PrefabContext.Provider>;

    return parentScene ? content : <SceneContext.Provider value={resolvedScene}>{content}</SceneContext.Provider>;
}
