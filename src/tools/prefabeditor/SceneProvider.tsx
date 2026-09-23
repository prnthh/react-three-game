import { useContext, useMemo, useState, type ReactNode } from "react";

import { createPrefabRegistry, PrefabContext, PrefabEditorMode, SceneContext } from "./SceneContext";
import type { PrefabApi, Scene } from "./SceneContext";
import { useAssetRuntime } from "./assetRuntime";
import { SelectionRuntimeProvider } from "./SelectionRuntime";
import { MaterialRuntimeProvider } from "./components/MaterialComponent";
import { PrefabStoreProvider, type PrefabStoreApi } from "./prefabStore";
import { SceneRuntime } from "../../runtime/SceneRuntime";
import { createPrefabApi } from "./prefabApi";

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

    return <SceneContext.Provider value={resolvedScene}>
        <PrefabContext.Provider value={resolvedPrefab}>
            <MaterialRuntimeProvider>{children}</MaterialRuntimeProvider>
        </PrefabContext.Provider>
    </SceneContext.Provider>;
}
