import { forwardRef, memo, useCallback, useContext, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";

import type { GameObject as GameObjectType, Prefab } from "./types";
import { getComponentRegistryVersion, subscribeComponentRegistry } from "./components/ComponentRegistry";
import { createPrefabStore, usePrefabRootId, usePrefabStore, usePrefabStoreApi } from "./prefabStore";
import type { PrefabStoreApi } from "./prefabStore";
import { useGameEvents, type GameEvents } from "./GameEvents";
import { PrefabEditorMode, RuntimeNodeIdPrefixContext, RuntimeNodeIdScope, usePrefab, useScene, type PrefabApi, type Scene } from "./SceneContext";
import { SceneProvider } from "./SceneProvider";
import { scopedNodeId } from "./gameObject";
import { PrefabNode, type RendererProps } from "./PrefabNode";
import {
    type NodeInteractionEvent,
    type NodeInteractionEventType,
} from "./usePointerEvents";

export type { Scene };

export interface PrefabRootProps {
    /** Placement identity when the same document is mounted more than once. */
    id?: string;
    editMode?: boolean;
    data?: Prefab;
    store?: PrefabStoreApi;
    selectedId?: string | null;
    enabled?: boolean;
    /** Internal staging: build visual resources while gameplay is disabled. */
    preparing?: boolean;
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (eventType: NodeInteractionEventType, event: NodeInteractionEvent, node: GameObjectType) => void;
    onEditNodeClick?: (event: ThreeEvent<MouseEvent>, node: GameObjectType) => void;
    basePath?: string;
    /** Advanced: inject the outer scene and document APIs, as PrefabEditor does. */
    scene?: Scene;
    prefab?: PrefabApi;
    children?: React.ReactNode;
}

export const PrefabRoot = forwardRef<Scene, PrefabRootProps>((props, ref) => {
    const { data, store, selectedId, editMode, ...bodyProps } = props;
    const [ownedStore] = useState<PrefabStoreApi | null>(() => {
        if (store) return null;
        if (data) return createPrefabStore(data);
        throw new Error("PrefabRoot requires either a `data` or `store` prop");
    });
    const lastAppliedDataRef = useRef(data);
    const resolvedStore = store ?? ownedStore;
    if (!resolvedStore) throw new Error("PrefabRoot requires either a `data` or `store` prop");

    useLayoutEffect(() => {
        if (!store && data && data !== lastAppliedDataRef.current) {
            lastAppliedDataRef.current = data;
            resolvedStore.getState().replacePrefab(data);
        }
    }, [data, resolvedStore, store]);

    return (
        <RuntimeNodeIdScope prefix={props.id ?? ""}><SceneProvider
            store={resolvedStore}
            scene={props.scene}
            prefab={props.prefab}
            editMode={editMode}
            basePath={props.basePath}
            selectedId={selectedId}
            onSelect={bodyProps.onSelect}
        >
            <PrefabRootBody ref={ref} {...bodyProps} />
        </SceneProvider></RuntimeNodeIdScope>
    );

});

const PrefabRootBody = memo(forwardRef<Scene, PrefabRootProps>(({ onSelect, onPointerEvent, onEditNodeClick, enabled = true, preparing = false, children }, ref) => {
    const scene = useScene();
    const gameEvents = useGameEvents();
    const prefix = useContext(RuntimeNodeIdPrefixContext);
    const editMode = scene.mode === PrefabEditorMode.Edit;
    const prefab = usePrefab();
    const registryVersion = useSyncExternalStore(subscribeComponentRegistry, getComponentRegistryVersion, getComponentRegistryVersion);
    const storeApi = usePrefabStoreApi();
    useImperativeHandle(ref, () => scene, [scene]);

    const lastPick = useRef<{ x: number; y: number; ids: string[]; index: number } | null>(null);

    const handleNodePointerEvent = useCallback((
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        fallbackObject: Object3D | null,
        eventName: string | null,
    ) => {
        const node = storeApi.getState().nodesById[nodeId];
        if (!node) return;
        emitNodePointerEvent(gameEvents, eventType, eventName, event, scopedNodeId(prefix, nodeId), node, fallbackObject);
        onPointerEvent?.(eventType, event, node);
    }, [gameEvents, onPointerEvent, prefix, storeApi]);

    const handleEditClick = useCallback((event: ThreeEvent<MouseEvent>) => {
        // Nested PrefabRef roots need an edit handler so their descendant meshes
        // participate in raycasting, but selection belongs to the outer document.
        // Leave the event unconsumed when this root has no selection callbacks.
        if (!onSelect && !onEditNodeClick) return;
        if (event.delta > 4) return;
        event.stopPropagation();

        const state = storeApi.getState();
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const intersection of event.intersections) {
            let object: Object3D | null = intersection.object;
            while (object) {
                const id = object.userData.prefabNodeId;
                const node = typeof id === 'string' ? state.nodesById[id] : null;
                if (node && !node.locked) {
                    if (!seen.has(id)) {
                        seen.add(id);
                        ids.push(id);
                    }
                    break;
                }
                object = object.parent;
            }
        }

        if (ids.length === 0) {
            lastPick.current = null;
            return;
        }

        const nativeEvent = event.nativeEvent;
        const previous = lastPick.current;
        const sameSpot = previous
            && Math.abs(previous.x - nativeEvent.clientX) <= 4
            && Math.abs(previous.y - nativeEvent.clientY) <= 4;
        const sameIds = sameSpot
            && previous.ids.length === ids.length
            && ids.every((id, index) => previous.ids[index] === id);
        const index = sameIds ? (previous.index + 1) % ids.length : 0;
        lastPick.current = { x: nativeEvent.clientX, y: nativeEvent.clientY, ids, index };

        const node = state.nodesById[ids[index]];
        onSelect?.(node.id);
        onEditNodeClick?.(event, node);
    }, [onEditNodeClick, onSelect, storeApi]);

    return (
        <group onClick={editMode ? handleEditClick : undefined}>
            <StoreRootNode
                onPointerEvent={editMode ? undefined : handleNodePointerEvent}
                registerRef={prefab.registerObject}
                editMode={editMode}
                registryVersion={registryVersion}
                isEnabled={enabled}
                preparing={preparing}
            />
            {children}
        </group>
    );
}));

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const prefabId = usePrefabStore(state => state.prefabId);
    const rootId = usePrefabRootId();
    return <PrefabNode key={`${prefabId ?? ''}:${rootId}`} {...props} nodeId={rootId} />;
}

function emitNodePointerEvent(
    gameEvents: GameEvents,
    eventType: NodeInteractionEventType,
    eventName: string | null,
    event: NodeInteractionEvent,
    nodeId: string,
    node: GameObjectType,
    fallbackObject: Object3D | null,
) {
    const nativeEvent = event.nativeEvent as MouseEvent | PointerEvent | WheelEvent;
    const payload = {
        sourceEntityId: nodeId,
        sourceNodeId: nodeId,
        nodeId,
        node,
        object: event.object ?? fallbackObject,
        point: [event.point.x, event.point.y, event.point.z] as [number, number, number],
        button: event.button,
        altKey: nativeEvent.altKey,
        ctrlKey: nativeEvent.ctrlKey,
        metaKey: nativeEvent.metaKey,
        shiftKey: nativeEvent.shiftKey,
        r3fEvent: event,
    };

    gameEvents.emit(eventType, payload);

    const trimmedEventName = eventType === "click" ? eventName?.trim() : "";
    if (!trimmedEventName) return;

    gameEvents.emit(trimmedEventName, payload);
}

export default PrefabRoot;
