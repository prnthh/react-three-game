import { AssetBoundary } from '../assets/AssetBoundary.js';
import { usePrefabStore, usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';
import { createContext, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo } from 'react';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useNode, usePrefab } from '../scene/SceneContext.js';
import { resolveInlinePrefab } from '../../core/inlinePrefabs.js';
import type { Prefab } from '../../core/types.js';
import { reconcilePrefabState } from '../../core/prefab.js';
import { createPrefabStore } from "../../core/prefabStore.js";
import { withBasePath } from "../assets/assetPaths.js";
import { describePrefabSource } from '../prefabs/prefabSource.js';
import { PrefabRoot } from '../prefabs/PrefabRoot.js';
import { useAsset } from '../assets/assetCache.js';

export type PrefabRefProperties = {
    url?: string;
    prefabId?: string;
};

// Track ancestry, not all loaded sources: sibling instances may share a definition.
const PrefabSourceAncestry = createContext<readonly (string | Prefab)[]>([]);

function LoadedPrefabRef({ properties, enabled }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const nodeId = useNode(node => node.nodeId);
    const url = useDeferredValue(properties.url ? withBasePath(basePath, properties.url) : '');
    const definitions = usePrefabStore(state => state.prefabs);
    const source = properties.prefabId ? definitions?.[properties.prefabId] : url;
    const ancestors = useContext(PrefabSourceAncestry);
    const cyclic = !!source && ancestors.includes(source);
    const external = useAsset('prefab', cyclic || properties.prefabId ? null : url);
    const document = cyclic ? null : properties.prefabId
        ? resolveInlinePrefab({ prefabs: definitions }, properties.prefabId) : external;
    // A revised definition at the same source updates this instance's store below.
    const store = useMemo(() => document ? createPrefabStore(document) : null, [url, properties.prefabId]);
    const ancestry = useMemo(() => source ? [...ancestors, source] : ancestors, [ancestors, source]);

    useLayoutEffect(() => {
        if (!document || !store) return;
        const current = store.getState();
        if (current.nodesById !== document.nodesById || current.prefabs !== document.prefabs) {
            current.restoreState(reconcilePrefabState(current, document));
        }
    }, [document, store]);
    useEffect(() => {
        if (cyclic) console.warn('[PrefabRef] Cyclic prefab reference:', properties.prefabId ?? describePrefabSource(url));
    }, [cyclic, url, properties.prefabId]);

    return <>
        {store && document && (
            <group>
                <PrefabSourceAncestry.Provider value={ancestry}>
                    <PrefabRoot id={nodeId} store={store} basePath={basePath} enabled={enabled} />
                </PrefabSourceAncestry.Provider>
            </group>
        )}
    </>;
}

function PrefabRefView(props: ComponentViewProps<PrefabRefProperties>) {
    const store = usePrefabStoreApi();
    return <><AssetBoundary subscribeToRetry={store.subscribe}><LoadedPrefabRef {...props} /></AssetBoundary>{props.children}</>;
}

const PrefabRefComponent: Component<PrefabRefProperties> = {
    dependencies: properties => !properties.prefabId && properties.url ? [{ kind: 'prefab', path: properties.url }] : [],
    name: 'PrefabRef',
    description: "Place an inline definition by prefabId or load a prefab by URL; use Transform here to place the instance. Each instance has its own objects and local node IDs.",
    renderWhenDisabled: true,
    View: PrefabRefView,
    properties: {
        prefabId: { description: "ID of a packed node in this scene. Takes precedence over URL.", type: 'string', default: '' },
        url: { description: "Prefab JSON URL relative to basePath, absolute URL, or legacy embedded data URL.", type: 'string', default: '' },
    },
};

export default PrefabRefComponent;
