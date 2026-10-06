import { EditPickContext } from '../scene/SelectionRuntime.js';
import { editPickIds } from '../scene/editPicking.js';
import { forwardRef, memo, useCallback, useContext, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";

import type { GameObject as GameObjectType, Prefab } from "../../core/types.js";
import { createPrefabStore } from "../../core/prefabStore.js";
import { usePrefabRootId, usePrefabStore, usePrefabStoreApi } from "./PrefabStoreContext.js";
import type { PrefabStoreApi } from "../../core/prefabStore.js";
import { useGameEvents, type GameEvents } from "../scene/GameEvents.js";
import { PrefabEditorMode, PrefabModeContext, RuntimeNodeIdPrefixContext, RuntimeNodeIdScope, usePrefab, useScene, type PrefabApi, type Scene } from "../scene/SceneContext.js";
import { SceneProvider } from "../scene/SceneProvider.js";
import { scopedNodeId } from "../scene/gameObject.js";
import { PrefabNode, type RendererProps } from "./PrefabNode.js";
import {
    type NodeInteractionEvent,
    type NodeInteractionEventType,
} from "../scene/usePointerEvents.js";

export type { Scene };

export interface PrefabRootProps {
    /** Placement identity when the same document is mounted more than once. */
    id?: string;
    editMode?: boolean;
    data?: Prefab;
    store?: PrefabStoreApi;
    selectedId?: string | null;
    enabled?: boolean;
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (eventType: NodeInteractionEventType, event: NodeInteractionEvent, node: GameObjectType) => void;
    onEditNodeClick?: (event: ThreeEvent<MouseEvent>, node: GameObjectType) => void;
    basePath?: string;
    /** Use the editor's document API for its shared object registry and asset access. */
    prefab?: PrefabApi;
    children?: React.ReactNode;
}

export const PrefabRoot = forwardRef<Scene, PrefabRootProps>((props, ref) => {
    const { data, store, selectedId, editMode, ...bodyProps } = props;
    const [ownedStore] = useState(() => data ? createPrefabStore(data) : null);
    const resolvedStore = store ?? ownedStore;
    if (!resolvedStore) throw new Error("PrefabRoot requires either a `data` or `store` prop");

    return (
        <RuntimeNodeIdScope prefix={props.id ?? ""}><SceneProvider
            store={resolvedStore}
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

const PrefabRootBody = memo(forwardRef<Scene, PrefabRootProps>(({ onSelect, onPointerEvent, onEditNodeClick, enabled = true, children }, ref) => {
    const inheritedEditPick = useContext(EditPickContext);
    const scene = useScene();
    const gameEvents = useGameEvents();
    const prefix = useContext(RuntimeNodeIdPrefixContext);
    const editMode = scene.mode === PrefabEditorMode.Edit;
    const prefab = usePrefab();
    const storeApi = usePrefabStoreApi();
    useImperativeHandle(ref, () => scene, [scene]);

    const lastPick = useRef<{ x: number; y: number; ids: string[]; index: number } | null>(null);
    const editModeRef = useRef(editMode);
    useLayoutEffect(() => { editModeRef.current = editMode; }, [editMode]);

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
        if (!editModeRef.current) return;
        // Nested PrefabRef roots need an edit handler so their descendant meshes
        // participate in raycasting, but selection belongs to the outer document.
        // Leave the event unconsumed when this root has no selection callbacks.
        if (!onSelect && !onEditNodeClick) return;
        if (event.delta > 4) return;
        event.stopPropagation();

        const state = storeApi.getState();
        const ids = editPickIds(event.intersections, state.nodesById, prefix);

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
    }, [onEditNodeClick, onSelect, prefix, storeApi]);

    return (
        <PrefabModeContext.Provider value={editMode}>
            <EditPickContext.Provider value={onSelect || onEditNodeClick ? handleEditClick : inheritedEditPick}>
                <group onClick={editMode ? handleEditClick : undefined}>
                    <StoreRootNode
                        onPointerEvent={handleNodePointerEvent}
                        registerRef={prefab.registerObject}
                        isEnabled={enabled}
                    />
                    {children}
                </group>
            </EditPickContext.Provider>
        </PrefabModeContext.Provider>
    );
}));

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const rootId = usePrefabRootId();
    return <PrefabNode key={rootId} {...props} nodeId={rootId} />;
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
