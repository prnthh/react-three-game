import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { createStore } from 'zustand/vanilla';
import type { PrefabStoreApi } from '../core/prefabStore.js';
import { NodeSelectionContext, RuntimeNodeIdPrefixContext } from '../runtime/scene/SceneContext.js';
import { InstanceClickContext } from '../runtime/rendering/MeshInstanceProvider.js';
import type { Intersection, Object3D } from 'three';
import type { GameObject } from '../core/types.js';

import { scopedNodeId, getObjectNodeIdentity, resolveRenderSource } from '../runtime/scene/gameObject.js';

export function editPickIds(hits: Pick<Intersection, 'object' | 'instanceId'>[], nodes: Record<string, GameObject>, scope = '') {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
        let object: Object3D | null = resolveRenderSource(hit.object, hit.instanceId);
        while (object) {
            const identity = getObjectNodeIdentity(object);
            const id = identity?.nodeId;
            // Source-local IDs can equal an outer placement ID. Only the owning
            // document's nodes are candidates; otherwise climb to its placement.
            const node = identity?.scope === scope && typeof id === 'string' ? nodes[id] : null;
            if (node && !node.locked && id !== undefined) {
                if (!seen.has(id)) { seen.add(id); ids.push(id); }
                break;
            }
            object = object.parent;
        }
    }
    return ids;
}

/** Owns editor selection and raycast policy; runtime roots only render their documents. */
export function EditorSelection({ store, selectedId = null, enabled, onSelect, children }: {
    store: PrefabStoreApi;
    selectedId?: string | null;
    enabled: boolean;
    onSelect: (id: string | null) => void;
    children: ReactNode;
}) {
    const scope = useContext(RuntimeNodeIdPrefixContext);
    const scopedSelection = selectedId === null ? null : scopedNodeId(scope, selectedId);
    const [selection] = useState(() => createStore(() => ({ selectedId: scopedSelection })));
    const selectionSource = useMemo(() => ({
        subscribe: selection.subscribe,
        getSelectedId: () => selection.getState().selectedId,
    }), [selection]);
    const active = useRef(enabled);
    useLayoutEffect(() => { active.current = enabled; }, [enabled]);
    useLayoutEffect(() => {
        if (selection.getState().selectedId !== scopedSelection) selection.setState({ selectedId: scopedSelection });
    }, [scopedSelection, selection]);
    const lastPick = useRef<{ x: number; y: number; ids: string[]; index: number } | null>(null);
    const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
        if (!active.current || event.delta > 4) return;
        event.stopPropagation();
        const ids = editPickIds(event.intersections, store.getState().nodesById, scope);
        if (!ids.length) { lastPick.current = null; return; }
        const { clientX: x, clientY: y } = event.nativeEvent;
        const previous = lastPick.current;
        const sameSpot = previous && Math.abs(previous.x - x) <= 4 && Math.abs(previous.y - y) <= 4;
        const sameIds = sameSpot && previous.ids.length === ids.length && ids.every((id, i) => previous.ids[i] === id);
        const index = sameIds ? (previous.index + 1) % ids.length : 0;
        lastPick.current = { x, y, ids, index };
        onSelect(ids[index]);
    }, [onSelect, scope, store]);
    return <NodeSelectionContext.Provider value={selectionSource}>
        <InstanceClickContext.Provider value={handleClick}>
            <group onClick={handleClick}>{children}</group>
        </InstanceClickContext.Provider>
    </NodeSelectionContext.Provider>;
}
