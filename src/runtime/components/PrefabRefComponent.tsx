import { AssetBoundary } from '../assets/AssetBoundary';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext';
import { createContext, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo } from 'react';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

import { useNode, usePrefab } from '../scene/SceneContext';

import { reconcilePrefabState } from '../../core/prefab';

import { createPrefabStore } from "../../core/prefabStore";

import { withBasePath } from "../assets/assetPaths";

import { describePrefabSource, isEmbeddedPrefabSource } from '../prefabs/prefabSource';

import { PrefabRoot } from '../prefabs/PrefabRoot';

import { clearAsset, useAsset } from '../assets/assetCache';

export type PrefabRefProperties = {
    url?: string;
};

// Track ancestry, not all loaded sources: sibling instances may share a definition.
const PrefabSourceAncestry = createContext<readonly string[]>([]);

function LoadedPrefabRef({ properties, enabled }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const { nodeId, preparing } = useNode();
    const url = useDeferredValue(properties.url ? withBasePath(basePath, properties.url) : '');
    const ancestors = useContext(PrefabSourceAncestry);
    const cyclic = ancestors.includes(url);
    const document = useAsset('prefab', cyclic ? null : url);
    const store = useMemo(() => document ? createPrefabStore(document) : null,
        [document?.prefabId, document?.rootId]);
    useEffect(() => () => {
        if (isEmbeddedPrefabSource(url)) clearAsset('prefab', url);
    }, [url]);
    const ancestry = useMemo(() => [...ancestors, url], [ancestors, url]);

    useLayoutEffect(() => {
        if (!document || !store) return;
        store.getState().restoreState(reconcilePrefabState(store.getState(), document));
    }, [document, store]);
    useEffect(() => {
        if (cyclic) console.warn('[PrefabRef] Cyclic prefab reference:', describePrefabSource(url));
    }, [cyclic, url]);

    return <>
        {store && (
            <group>
                <PrefabSourceAncestry.Provider value={ancestry}>
                    <PrefabRoot id={nodeId} store={store} basePath={basePath} enabled={enabled} preparing={preparing} />
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
    renderWhenDisabled: true,
    View: PrefabRefView,
    properties: {
        url: { type: 'string', default: '' },
    },
};

export default PrefabRefComponent;
