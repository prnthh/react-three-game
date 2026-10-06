import { AssetBoundary } from '../assets/AssetBoundary.js';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';
import { createContext, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

import { useNode, usePrefab } from '../scene/SceneContext.js';

import { reconcilePrefabState } from '../../core/prefab.js';

import { createPrefabStore } from "../../core/prefabStore.js";

import { withBasePath } from "../assets/assetPaths.js";

import { describePrefabSource } from '../prefabs/prefabSource.js';

import { PrefabRoot } from '../prefabs/PrefabRoot.js';

import { useAsset } from '../assets/assetCache.js';

export type PrefabRefProperties = {
    url?: string;
};

// Track ancestry, not all loaded sources: sibling instances may share a definition.
const PrefabSourceAncestry = createContext<readonly string[]>([]);

function LoadedPrefabRef({ properties, enabled }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const nodeId = useNode(node => node.nodeId);
    const url = useDeferredValue(properties.url ? withBasePath(basePath, properties.url) : '');
    const ancestors = useContext(PrefabSourceAncestry);
    const cyclic = ancestors.includes(url);
    const document = useAsset('prefab', cyclic ? null : url);
    // A revised definition at the same source updates this instance's store below.
    const store = useMemo(() => document ? createPrefabStore(document) : null, [url]);
    // Definitions belong to the shared asset cache. Instance cleanup must not
    // evict a definition still used by siblings or React's effect replay.
    const ancestry = useMemo(() => [...ancestors, url], [ancestors, url]);

    const applied = useRef({ store, document });
    useLayoutEffect(() => {
        if (!document || !store) return;
        if (applied.current.store === store && applied.current.document !== document) {
            store.getState().restoreState(reconcilePrefabState(store.getState(), document));
        }
        applied.current = { store, document };
    }, [document, store]);
    useEffect(() => {
        if (cyclic) console.warn('[PrefabRef] Cyclic prefab reference:', describePrefabSource(url));
    }, [cyclic, url]);

    return <>
        {store && (
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
    dependencies: properties => properties.url ? [{ kind: 'prefab', path: properties.url }] : [],
    name: 'PrefabRef',
    description: "Load a prefab scene below this node; use Transform here to place the instance. Each instance has its own objects and local node IDs.",
    renderWhenDisabled: true,
    View: PrefabRefView,
    properties: {
        url: { description: "Prefab JSON URL relative to basePath, absolute URL, or embedded data URL produced by pack().", type: 'string', default: '' },
    },
};

export default PrefabRefComponent;
