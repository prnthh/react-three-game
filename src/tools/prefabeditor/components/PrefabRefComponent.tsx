import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ThreeEvent } from '@react-three/fiber';

import type { Component, ComponentViewProps } from './ComponentRegistry';

import { RuntimeNodeIdScope, useNode, usePrefab } from '../SceneContext';

import { useEditSelection } from '../SelectionRuntime';

import { createPrefabStore, type PrefabStoreApi } from '../prefabStore';

import { withBasePath } from '../runtimeUtils';

import { PrefabRoot } from '../PrefabRoot';

import { useAssetRuntime, useLoadPrefab } from '../assetRuntime';

export type PrefabRefProperties = {
    url?: string;
};

function PrefabRefView({ properties, enabled, children }: ComponentViewProps<PrefabRefProperties>) {
    const { basePath } = usePrefab();
    const { editMode, nodeId, preparing } = useNode();
    const selectEditorNode = useEditSelection();
    const runtime = useAssetRuntime();
    const [loaded, setLoaded] = useState<{ url: string; store: PrefabStoreApi } | null>(null);
    const loadPrefab = useLoadPrefab();
    const url = properties.url ? withBasePath(basePath, properties.url) : '';
    const cached = runtime.getPrefab(url);
    const cachedStore = useMemo(() => cached ? createPrefabStore(cached) : null, [cached, url]);
    const store = cachedStore ?? (loaded?.url === url ? loaded.store : null);

    useEffect(() => {
        let active = true;
        if (cachedStore) return;
        if (url) void loadPrefab(url).then(value => {
            if (active) setLoaded({ url, store: createPrefabStore(value) });
        }).catch(error => console.warn('[PrefabRef] Failed to load:', url, error));
        return () => { active = false; };
    }, [cachedStore, loadPrefab, url]);

    const selectPlacement = useCallback((event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4) return;
        event.stopPropagation();
        selectEditorNode?.(nodeId);
    }, [nodeId, selectEditorNode]);

    return <>
        {store && (
            <group onClick={editMode && selectEditorNode ? selectPlacement : undefined}>
                <RuntimeNodeIdScope prefix={nodeId}>
                    <PrefabRoot store={store} basePath={basePath} enabled={enabled} preparing={preparing} />
                </RuntimeNodeIdScope>
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
