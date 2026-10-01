import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

import { useNode, usePrefab } from '../scene/SceneContext';

import { reconcilePrefabState, type PrefabState } from '../../core/prefab';

import { createPrefabStore, type PrefabStoreApi } from "../../core/prefabStore";

import { withBasePath } from "../assets/assetPaths";

import { describePrefabSource } from '../prefabs/prefabSource';

import { PrefabRoot } from '../prefabs/PrefabRoot';

import { useAssetRuntime } from '../assets/AssetRuntime';

export type PrefabRefProperties = {
    url?: string;
};

// Track ancestry, not all loaded sources: sibling instances may share a definition.
const PrefabSourceAncestry = createContext<readonly string[]>([]);

function PrefabRefView({ properties, enabled, children }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const { nodeId, preparing } = useNode();
    const runtime = useAssetRuntime();
    const url = properties.url ? withBasePath(basePath, properties.url) : '';
    const ancestors = useContext(PrefabSourceAncestry);
    const cyclic = ancestors.includes(url);
    const [loaded, setLoaded] = useState<{ url: string; document: PrefabState; store: PrefabStoreApi } | null>(() => {
        const document = runtime.getPrefab(url);
        return document ? { url, document, store: createPrefabStore(document) } : null;
    });
    const loadedRef = useRef(loaded);
    // Keep the previous version visible while its replacement loads. Retaining
    // the store also retains meshes, geometry and gameplay on unchanged nodes.
    const store = url && !cyclic ? loaded?.store : null;
    // A replacement can still be loading; track the document actually on screen.
    const ancestry = useMemo(() => [...ancestors, loaded?.url ?? url], [ancestors, loaded?.url, url]);

    useEffect(() => {
        if (!url) return;
        if (cyclic) {
            console.warn('[PrefabRef] Cyclic prefab reference:', describePrefabSource(url));
            return;
        }
        let active = true;
        const lease = runtime.acquirePrefab(url);
        void lease.ready.then(document => {
            if (!active) return;
            const previous = loadedRef.current;
            if (previous?.url === url && previous.document === document) return;
            const sameIdentity = previous && previous.document.rootId === document.rootId
                && previous.document.prefabId === document.prefabId;
            const store = sameIdentity ? previous.store : createPrefabStore(document);
            if (sameIdentity) store.getState().restoreState(reconcilePrefabState(store.getState(), document));
            const next = { url, document, store };
            loadedRef.current = next;
            setLoaded(next);
        }).catch(error => {
            if (!active) return;
            loadedRef.current = null;
            setLoaded(null);
            console.warn('[PrefabRef] Failed to load:', describePrefabSource(url), error);
        });
        return () => { active = false; lease.release(); };
    }, [runtime, url, cyclic]);

    return <>
        {store && (
            <group>
                <PrefabSourceAncestry.Provider value={ancestry}>
                    <PrefabRoot id={nodeId} store={store} basePath={basePath} enabled={enabled} preparing={preparing} />
                </PrefabSourceAncestry.Provider>
            </group>
        )}
        {children}
    </>;
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
