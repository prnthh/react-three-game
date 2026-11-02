import { forwardRef, memo, useCallback, useContext, useImperativeHandle, useMemo, useState } from 'react';
import type { Object3D } from 'three';
import type { GameObject, Prefab } from '../../core/types.js';
import { createPrefabStore, type PrefabStoreApi } from '../../core/prefabStore.js';
import { PrefabStoreProvider, usePrefabRootId, usePrefabStoreApi } from './PrefabStoreContext.js';
import { useGameEvents, type GameEvents } from '../scene/GameEvents.js';
import { createPrefabRegistry, PrefabContext, PrefabEditorMode, SceneContext, RuntimeNodeIdPrefixContext, RuntimeNodeIdScope, NodeScope, type PrefabApi, type Scene } from '../scene/SceneContext.js';
import { SceneRuntime } from '../SceneRuntime.js';
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import { createPrefabApi } from './prefabApi.js';
import { scopedNodeId } from '../scene/gameObject.js';
import { PrefabNode } from './PrefabNode.js';
import { ComponentLookupContext, analyzeNodeComponents } from './nodePlan.js';
import { MeshInstanceProvider } from '../rendering/MeshInstanceProvider.js';
import { usePrefabStore } from './PrefabStoreContext.js';
import type { NodeInteractionEvent, NodeInteractionEventType } from '../scene/usePointerEvents.js';

export type { Scene };

export interface PrefabRootProps {
    /** Placement identity when the same document is mounted more than once. */
    id?: string;
    editMode?: boolean;
    data?: Prefab;
    store?: PrefabStoreApi;
    enabled?: boolean;
    onPointerEvent?: (eventType: NodeInteractionEventType, event: NodeInteractionEvent, node: GameObject) => void;
    basePath?: string;
    /** Share an existing document API and live object registry. */
    prefab?: PrefabApi;
    children?: React.ReactNode;
}

/** Establish a document instance, then render its root node. Shared services are inherited. */
export const PrefabRoot = forwardRef<Scene, PrefabRootProps>(({ data, store, id = '', ...props }, ref) => {
    const [ownedStore] = useState(() => !store && data ? createPrefabStore(data) : null);
    const resolvedStore = store ?? ownedStore;
    if (!resolvedStore) throw new Error('PrefabRoot requires either a `data` or `store` prop');
    return <SceneRuntime>
        <RuntimeNodeIdScope prefix={id}>
            <PrefabStoreProvider store={resolvedStore}>
                <PrefabRootBody ref={ref} {...props} />
            </PrefabStoreProvider>
        </RuntimeNodeIdScope>
    </SceneRuntime>;
});

const PrefabRootBody = memo(forwardRef<Scene, Omit<PrefabRootProps, 'data' | 'store' | 'id'>>(({
    prefab, editMode = false, basePath = '', onPointerEvent, enabled = true, children,
}, ref) => {
    const store = usePrefabStoreApi();
    const rootId = usePrefabRootId();
    const rootNode = usePrefabStore(state => state.nodesById[state.rootId]);
    const lookup = useContext(ComponentLookupContext);
    const runtime = useAssetRuntime();
    const events = useGameEvents();
    const prefix = useContext(RuntimeNodeIdPrefixContext);
    const parentScene = useContext(SceneContext);
    const [registry] = useState(createPrefabRegistry);
    const document = useMemo(() => prefab ?? createPrefabApi(store, registry, () => runtime, basePath),
        [prefab, store, registry, runtime, basePath]);
    const scene = useMemo<Scene>(() => parentScene ?? ({
        get root() { return document.root; },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
    }), [parentScene, document, editMode]);
    useImperativeHandle(ref, () => scene, [scene]);
    const handlePointerEvent = useCallback((eventType: NodeInteractionEventType, event: NodeInteractionEvent,
        nodeId: string, object: Object3D | null, eventName: string | null) => {
        const node = store.getState().nodesById[nodeId];
        if (!node) return;
        emitNodePointerEvent(events, eventType, eventName, event, scopedNodeId(prefix, nodeId), node, object);
        onPointerEvent?.(eventType, event, node);
    }, [events, onPointerEvent, prefix, store]);

    let content: React.ReactNode = <MeshInstanceProvider>
        <PrefabNode key={rootId} nodeId={rootId} onPointerEvent={handlePointerEvent} isEnabled={enabled} />
        {children}
    </MeshInstanceProvider>;
    if (!parentScene && !rootNode.disabled && !rootNode.hidden) {
        const components = analyzeNodeComponents(rootNode, lookup, 'scene').composition;
        for (let index = components.length - 1; index >= 0; index--) {
            const { View, key, properties } = components[index];
            content = <View key={key} properties={properties} enabled={enabled}>{content}</View>;
        }
    }
    return <SceneContext.Provider value={scene}>
        <PrefabContext.Provider value={document}><NodeScope nodeId={rootId} editMode={editMode}>{content}</NodeScope></PrefabContext.Provider>
    </SceneContext.Provider>;
}));

function emitNodePointerEvent(
    gameEvents: GameEvents,
    eventType: NodeInteractionEventType,
    eventName: string | null,
    event: NodeInteractionEvent,
    nodeId: string,
    node: GameObject,
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
