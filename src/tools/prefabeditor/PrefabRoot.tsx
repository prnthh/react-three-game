import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Matrix4 } from "three";
import type { Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";

import { getNodeUserData } from "./types";
import type { ComponentData, GameObject as GameObjectType, Prefab } from "./types";
import type { Component } from "./components/ComponentRegistry";
import { getComponentDef, resolveComponentProperties } from "./components/ComponentRegistry";
import { composeTransform, decompose } from "./runtimeUtils";
import { createPrefabStore, usePrefabRenderNode, usePrefabRootId, usePrefabStore, usePrefabStoreApi } from "./prefabStore";
import type { PrefabStoreApi } from "./prefabStore";
import { gameEvents } from "./GameEvents";
import { NodeScope, PrefabEditorMode, usePrefab, usePrefabRenderCache, useScene, type PrefabApi, type Scene } from "./SceneContext";
import { SceneProvider } from "./SceneProvider";
import { useNodeSelected } from "./SelectionRuntime";
import {
    createNodeInteractionHandlers,
    type NodeInteractionEvent,
    type NodeInteractionEventType,
} from "./usePointerEvents";

const IDENTITY = new Matrix4();
const EMPTY_NODE_COMPONENTS: AnalyzedNodeComponents = {
    clickEvent: { enabled: false, eventName: null },
    composition: [],
    transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
    },
    transformComponent: undefined,
    usesWorldPosition: false,
};

function getNodeMetadataProps(node: GameObjectType) {
    const nodeName = node.name?.trim() ?? '';
    return {
        name: nodeName,
        userData: {
            prefabNodeId: node.id,
            ...(nodeName ? { prefabNodeName: nodeName } : {}),
            ...getNodeUserData(node),
        },
    };
}

export type { Scene };

export interface PrefabRootProps {
    editMode?: boolean;
    data?: Prefab;
    store?: PrefabStoreApi;
    selectedId?: string | null;
    enabled?: boolean;
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (eventType: NodeInteractionEventType, event: NodeInteractionEvent, node: GameObjectType) => void;
    onEditNodeClick?: (event: ThreeEvent<MouseEvent>, node: GameObjectType) => void;
    basePath?: string;
    /** Advanced: inject the outer scene and document APIs, as PrefabEditor does. */
    scene?: Scene;
    prefab?: PrefabApi;
    children?: React.ReactNode;
}

type CompositionComponent = {
    key: string;
    type: string;
    View: NonNullable<Component["View"]>;
    properties: ComponentData["properties"];
    attachment: boolean;
    object: boolean;
    renderWhenDisabled: boolean;
};

type AnalyzedNodeComponents = {
    clickEvent: ClickEventConfig;
    composition: CompositionComponent[];
    transform: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
    };
    transformComponent: ComponentData | undefined;
    usesWorldPosition: boolean;
};

type ClickEventConfig = {
    enabled: boolean;
    eventName: string | null;
};

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
        <SceneProvider
            store={resolvedStore}
            scene={props.scene}
            prefab={props.prefab}
            editMode={editMode}
            basePath={props.basePath}
            selectedId={selectedId}
            onSelect={bodyProps.onSelect}
        >
            <PrefabRootBody ref={ref} {...bodyProps} />
        </SceneProvider>
    );

});

const PrefabRootBody = memo(forwardRef<Scene, PrefabRootProps>(({ onSelect, onPointerEvent, onEditNodeClick, basePath = "", enabled = true, children }, ref) => {
    const scene = useScene();
    const editMode = scene.mode === PrefabEditorMode.Edit;
    const prefab = usePrefab();
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
        emitNodePointerEvent(eventType, eventName, event, nodeId, node, fallbackObject);
        onPointerEvent?.(eventType, event, node);
    }, [onPointerEvent, storeApi]);

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
                parentMatrix={IDENTITY}
                isEnabled={enabled}
                basePath={basePath}
            />
            {children}
        </group>
    );
}));

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const prefabId = usePrefabStore(state => state.prefabId);
    const rootId = usePrefabRootId();
    return <GameObjectRenderer key={`${prefabId ?? ''}:${rootId}`} {...props} nodeId={rootId} />;
}

function analyzeNodeComponents(node: GameObjectType, cache: WeakMap<GameObjectType, AnalyzedNodeComponents>): AnalyzedNodeComponents {
    const cached = cache.get(node);
    if (cached) return cached;

    const componentMap = node.components ?? {};
    const composition: CompositionComponent[] = [];
    let clickEvent: ClickEventConfig = EMPTY_NODE_COMPONENTS.clickEvent;
    let transform = EMPTY_NODE_COMPONENTS.transform;
    let transformComponent: ComponentData | undefined;
    let usesWorldPosition = false;
    let cacheable = true;

    for (const [key, component] of Object.entries(componentMap)) {
        if (!component?.type) continue;
        const def = getComponentDef(component.type);
        if (!def) cacheable = false;
        const properties = resolveComponentProperties(def, component.properties);

        if (component.type === "Transform") {
            transformComponent = component;
            transform = {
                position: properties.position ?? [0, 0, 0],
                rotation: properties.rotation ?? [0, 0, 0],
                scale: properties.scale ?? [1, 1, 1],
            };
            continue;
        }
        if (!def?.View) continue;
        if (def.usesWorldPosition) usesWorldPosition = true;

        composition.push({
            key,
            type: component.type,
            View: def.View,
			properties,
            attachment: def.attachment === true,
            object: def.attach === 'object',
            renderWhenDisabled: def.renderWhenDisabled === true,
        });

        if (!clickEvent.enabled && 'emitClickEvent' in def.properties && properties.emitClickEvent) {
            const eventName = properties.clickEventName;
            clickEvent = {
                enabled: true,
                eventName: typeof eventName === 'string' && eventName.trim() ? eventName.trim() : null,
            };
        }
    }

    composition.sort((left, right) => {
        const leftOrder = left.attachment ? 2 : left.object ? 1 : 0;
        const rightOrder = right.attachment ? 2 : right.object ? 1 : 0;
        return leftOrder - rightOrder;
    });

    const value = {
        clickEvent,
        composition,
        transform,
        transformComponent,
        usesWorldPosition,
    };
    if (cacheable) cache.set(node, value);
    return value;
}

function emitNodePointerEvent(
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

export const GameObjectRenderer = memo(function GameObjectRenderer({
    nodeId,
    onPointerEvent,
    registerRef,
    editMode,
    parentMatrix = IDENTITY,
    isVisible = true,
    isEnabled = true,
    basePath = "",
}: RendererProps) {
    const analyzedNodes = usePrefabRenderCache<AnalyzedNodeComponents>();
    const [gameObject, childIds] = usePrefabRenderNode(nodeId);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject, analyzedNodes) : EMPTY_NODE_COMPONENTS,
        [analyzedNodes, gameObject],
    );
    const isSelected = useNodeSelected(nodeId, Boolean(editMode));
    const { transform, transformComponent } = analyzedComponents;

    const groupRef = useRef<Object3D | null>(null);
    const handleGroupRef = useCallback((object: Object3D | null) => {
        groupRef.current = object;
        registerRef(nodeId, object);
    }, [nodeId, registerRef]);

    const primaryInteractionHandlers = !editMode && analyzedComponents.clickEvent.enabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, nodeId, groupRef.current, analyzedComponents.clickEvent.eventName);
        })
        : undefined;

    const needsWorldMatrix = childIds.length > 0 || analyzedComponents.usesWorldPosition;
    const world = useMemo(
        () => needsWorldMatrix
            ? parentMatrix.clone().multiply(composeTransform(transform.position, transform.rotation, transform.scale))
            : IDENTITY,
        [needsWorldMatrix, parentMatrix, transformComponent],
    );

    if (!gameObject) return null;

    const nodeEnabled = isEnabled && !gameObject.disabled;
    const nodeVisible = nodeEnabled && isVisible && !gameObject.hidden;
    const metadataProps = getNodeMetadataProps(gameObject);

    const transformProps = {
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
    };
    const groupProps = {
        ...metadataProps,
        ...transformProps,
    };
    const childNodes = <ChildNodes childIds={childIds} parentMatrix={world}
        onPointerEvent={onPointerEvent}
        registerRef={registerRef}
        editMode={editMode}
        isVisible={nodeVisible}
        isEnabled={nodeEnabled}
        basePath={basePath}
    />;
    const inner = renderNodeContent(analyzedComponents, childNodes, nodeEnabled);

    return <>
        <NodeScope
            nodeId={nodeId}
            editMode={editMode}
            isSelected={isSelected}
            nodeInteractionHandlers={primaryInteractionHandlers}
            worldPosition={analyzedComponents.usesWorldPosition ? decompose(world).position : undefined}
        >
            <group
                ref={handleGroupRef}
                {...groupProps}
                {...primaryInteractionHandlers}
                visible={nodeVisible}
            >
                {inner}
            </group>
        </NodeScope>
    </>;
});

interface RendererProps {
    nodeId: string;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
        eventName: string | null,
    ) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    editMode?: boolean;
    parentMatrix?: Matrix4;
    isVisible?: boolean;
    isEnabled?: boolean;
    basePath?: string;
}

function ChildNodes({ childIds, parentMatrix, ...props }: { childIds: string[]; parentMatrix: Matrix4 } & Omit<RendererProps, 'nodeId' | 'parentMatrix'>) {
    return childIds.map(childId =>
        <GameObjectRenderer
            key={childId}
            nodeId={childId}
            parentMatrix={parentMatrix}
            {...props}
        />
    );
}

function renderNodeContent(
    analyzedComponents: AnalyzedNodeComponents,
    childNodes?: React.ReactNode,
    enabled = true,
) {
    const components = analyzedComponents.composition;
    let content = childNodes;
    for (let index = components.length - 1; index >= 0; index -= 1) {
        const component = components[index];
        if (!enabled && !component.renderWhenDisabled) continue;
        const View = component.View;
        content = <View key={component.key} properties={component.properties} enabled={enabled}>{content}</View>;
    }
    return content;
}

export default PrefabRoot;
