import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Matrix4 } from "three";
import type { Group, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useStore } from "zustand";

import { findComponent, getNodeUserData } from "./types";
import type { ComponentData, GameObject as GameObjectType, Prefab } from "./types";
import type { Component } from "./components/ComponentRegistry";
import { getComponentDef, resolveComponentProperties } from "./components/ComponentRegistry";
import { loadModel, loadSound, loadTexture } from "../dragdrop";
import { GameInstanceBatch, GameInstanceProvider, getRepeatAxesFromModelProperties, useIsModelPathInstanced } from "./InstanceProvider";
import { composeTransform, decompose, withBasePath } from "./runtimeUtils";
import { createPrefabStore, PrefabStoreProvider, usePrefabChildIds, usePrefabNode, usePrefabRootId, usePrefabStore, usePrefabStoreApi } from "./prefabStore";
import type { PrefabStoreApi } from "./prefabStore";
import { AssetRuntimeProvider, useAssetRuntime, useModelAsset } from "./assetRuntime";
import { gameEvents } from "./GameEvents";
import { NodeScope, PrefabEditorMode, usePrefab, useScene, type PrefabApi, type Scene } from "./SceneContext";
import { SceneProvider } from "./SceneProvider";
import { RuntimeWrappers } from "./RuntimeWrapperRegistry";
import { SelectionRuntimeProvider, useNodeSelected } from "./SelectionRuntime";
import {
    createNodeInteractionHandlers,
    type NodeInteractionEvent,
    type NodeInteractionEventType,
} from "./usePointerEvents";

const IDENTITY = new Matrix4();

const EMPTY_NODE_COMPONENTS: AnalyzedNodeComponents = {
    clickEvent: { enabled: false, eventName: null },
    composition: [],
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

    useEffect(() => {
        if (!store && data && data !== lastAppliedDataRef.current) {
            lastAppliedDataRef.current = data;
            resolvedStore.getState().replacePrefab(data);
        }
    }, [data, resolvedStore, store]);

    return (
        <PrefabStoreProvider store={resolvedStore}>
            <AssetRuntimeProvider>
                <SceneProvider store={resolvedStore} scene={props.scene} prefab={props.prefab} editMode={editMode} basePath={props.basePath}>
                    <RuntimeWrappers>
                        <SelectionRuntimeProvider selectedId={selectedId} select={bodyProps.onSelect}>
                            <PrefabRootBody ref={ref} {...bodyProps} />
                        </SelectionRuntimeProvider>
                    </RuntimeWrappers>
                </SceneProvider>
            </AssetRuntimeProvider>
        </PrefabStoreProvider>
    );
});

const PrefabRootBody = memo(forwardRef<Scene, PrefabRootProps>(({ onSelect, onPointerEvent, onEditNodeClick, basePath = "", enabled = true, children }, ref) => {
    const scene = useScene();
    const editMode = scene.mode === PrefabEditorMode.Edit;
    const prefab = usePrefab();
    const runtime = useAssetRuntime();
    const storeApi = usePrefabStoreApi();
    const assetRefCounts = useStore(storeApi, state => state.assetRefCounts);
    useImperativeHandle(ref, () => scene, [scene]);

    const loading = useRef(new Set<string>());
    const lastPick = useRef<{ x: number; y: number; ids: string[]; index: number } | null>(null);

    useEffect(() => {
        const tryLoad = (entry: string, path: string, hasLoaded: boolean, run: () => Promise<{ success: boolean; error?: unknown }>) => {
            const loadKey = `${entry}@${path}`;
            if (hasLoaded || loading.current.has(loadKey)) return;
            loading.current.add(loadKey);
            void (async () => {
                try {
                    const result = await run();
                    if (!result.success) {
                        console.warn(`Failed to load asset: ${path}`, result.error);
                    }
                } catch (error) {
                    console.warn(`Failed to load asset: ${path}`, error);
                } finally {
                    loading.current.delete(loadKey);
                }
            })();
        };

        Object.keys(assetRefCounts).forEach(entry => {
            const sep = entry.indexOf(':');
            const type = entry.slice(0, sep);
            const file = entry.slice(sep + 1);
            const path = withBasePath(basePath, file);

            if (type === 'model') {
                tryLoad(entry, path, !!runtime.getModel(path), async () => {
                    const r = await loadModel(path);
                    if (r.success && r.model) runtime.registerModel(path, r.model);
                    return r;
                });
            } else if (type === 'texture') {
                tryLoad(entry, path, !!runtime.getTexture(path), async () => {
                    const r = await loadTexture(path);
                    if (r.success && r.texture) runtime.registerTexture(path, r.texture);
                    return r;
                });
            } else if (type === 'sound') {
                tryLoad(entry, path, !!runtime.getSound(path), async () => {
                    const r = await loadSound(path);
                    if (r.success && r.sound) runtime.registerSound(path, r.sound);
                    return r;
                });
            }
        });
    }, [assetRefCounts, basePath, runtime]);

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
        <GameInstanceProvider
            editMode={editMode}
            onEditClick={editMode ? handleEditClick : undefined}
            onPointerEvent={editMode ? undefined : handleNodePointerEvent}
            registerRef={prefab.registerObject}
            getObject={prefab.getObject}
        >
            <StoreRootNode
                onPointerEvent={editMode ? undefined : handleNodePointerEvent}
                registerRef={prefab.registerObject}
                editMode={editMode}
                parentMatrix={IDENTITY}
                isEnabled={enabled}
                basePath={basePath}
            />
            {children}
        </GameInstanceProvider>
    );
}));

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const prefabId = usePrefabStore(state => state.prefabId);
    const rootId = usePrefabRootId();
    return <GameObjectRenderer key={`${prefabId ?? ''}:${rootId}`} {...props} nodeId={rootId} />;
}

function getClickEventConfig(node: GameObjectType): ClickEventConfig {
	const component = Object.values(node.components ?? {}).find(entry => {
		if (!entry?.type) return false;
		return resolveComponentProperties(getComponentDef(entry.type), entry.properties).emitClickEvent;
	});
	const resolved = component
		? resolveComponentProperties(getComponentDef(component.type), component.properties)
		: null;
	const eventName = resolved?.clickEventName;
    return {
        enabled: Boolean(component),
        eventName: typeof eventName === 'string' && eventName.trim() ? eventName.trim() : null,
    };
}

function analyzeNodeComponents(node: GameObjectType): AnalyzedNodeComponents {
    const composition: CompositionComponent[] = [];

    for (const [key, component] of Object.entries(node.components ?? {})) {
        if (!component?.type || component.type === "Transform") continue;
        const def = getComponentDef(component.type);
        if (!def?.View) continue;

        composition.push({
            key,
            type: component.type,
            View: def.View,
			properties: resolveComponentProperties(def, component.properties),
            attachment: def.attachment === true,
            object: def.disableSiblingComposition === 'object',
            renderWhenDisabled: def.renderWhenDisabled === true,
        });
    }

    return {
        clickEvent: getClickEventConfig(node),
        composition,
    };
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

export function GameObjectRenderer(props: RendererProps) {
    const node = usePrefabNode(props.nodeId);
    const modelProperties = findComponent(node, "Model")?.properties;
    const modelPath = modelProperties?.filename
        ? withBasePath(props.basePath ?? "", modelProperties.filename)
        : undefined;
    const model = useModelAsset(modelPath);
    const isInstanced = Boolean(model) && (model?.animations.length ?? 0) === 0;

    if (!node) return null;

    return isInstanced
        ? <InstancedNode {...props} />
        : <StandardNode {...props} />;
}


function InstancedNode({
    nodeId,
    parentMatrix = IDENTITY,
    editMode,
    registerRef,
    onPointerEvent,
    isVisible = true,
    isEnabled = true,
    basePath = "",
}: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    const childIds = usePrefabChildIds(nodeId);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject) : EMPTY_NODE_COMPONENTS,
        [gameObject],
    );
    const transformComponent = findComponent(gameObject, "Transform");
    const localTransform = getNodeTransformProps(gameObject);
    const isSelected = useNodeSelected(nodeId);

    const modelComponent = findComponent(gameObject, "Model");
    const modelPath = modelComponent?.properties?.filename
        ? withBasePath(basePath, modelComponent.properties.filename)
        : undefined;
    const instances = useMemo(
        () => buildRepeatedInstances(gameObject, modelPath),
        [gameObject?.id, modelComponent, modelPath]
    );
    const isModelPathInstanced = useIsModelPathInstanced(modelPath);

    const groupRef = useRef<Group | null>(null);
    const handleGroupRef = useCallback((object: Group | null) => {
        groupRef.current = object;
        registerRef(nodeId, object);
    }, [nodeId, registerRef]);

    if (!gameObject) return null;

    const nodeEnabled = isEnabled && !gameObject.disabled;
    const nodeVisible = nodeEnabled && isVisible && !gameObject.hidden;
    const nodeInteractionHandlers = !editMode && analyzedComponents.clickEvent.enabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, nodeId, groupRef.current, analyzedComponents.clickEvent.eventName);
        })
        : undefined;
    const world = useMemo(
        () => parentMatrix.clone().multiply(composeTransform(localTransform.position, localTransform.rotation, localTransform.scale)),
        [parentMatrix, transformComponent],
    );
    const groupProps = {
        ...getNodeMetadataProps(gameObject),
        visible: nodeVisible,
        position: localTransform.position,
        rotation: localTransform.rotation,
        scale: localTransform.scale,
    };

    const instanceBatch = useMemo(() => instances.map(instance => ({
        ...instance,
        visible: nodeVisible,
        clickEnabled: nodeEnabled && analyzedComponents.clickEvent.enabled,
        clickEventName: analyzedComponents.clickEvent.eventName,
    })), [analyzedComponents.clickEvent, instances, nodeVisible]);
    const childNodes = (
        <ChildNodes
            childIds={childIds}
            parentMatrix={world}
            onPointerEvent={onPointerEvent}
            registerRef={registerRef}
            editMode={editMode}
            isVisible={nodeVisible}
            isEnabled={nodeEnabled}
            basePath={basePath}
        />
    );
    const logicalContent = renderNodeContent(
        analyzedComponents,
        childNodes,
        isModelPathInstanced ? "Model" : undefined,
        nodeEnabled,
    );

    return (
        <NodeScope
            nodeId={nodeId}
            editMode={editMode}
            isSelected={isSelected}
            nodeInteractionHandlers={nodeInteractionHandlers}
            worldPosition={analyzedComponents.composition.length ? decompose(world).position : undefined}
        >
            <group
                ref={handleGroupRef}
                {...groupProps}
                {...nodeInteractionHandlers}
            >
                {logicalContent}
            </group>
            <GameInstanceBatch sourceId={gameObject.id} instances={instanceBatch} />
        </NodeScope>
    );
}

function StandardNode({
    nodeId,
    onPointerEvent,
    registerRef,
    editMode,
    parentMatrix = IDENTITY,
    isVisible = true,
    isEnabled = true,
    basePath = "",
}: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    const childIds = usePrefabChildIds(nodeId);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject) : EMPTY_NODE_COMPONENTS,
        [gameObject],
    );
    const isSelected = useNodeSelected(nodeId);
    const transformComponent = findComponent(gameObject, "Transform");
    const transform = getNodeTransformProps(gameObject);

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

    const world = useMemo(
        () => parentMatrix.clone().multiply(composeTransform(transform.position, transform.rotation, transform.scale)),
        [parentMatrix, transformComponent],
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

    const inner = renderNodeContent(
        analyzedComponents,
        childNodes,
        undefined,
        nodeEnabled,
    );
    return (
        <NodeScope
            nodeId={nodeId}
            editMode={editMode}
            isSelected={isSelected}
            nodeInteractionHandlers={primaryInteractionHandlers}
            worldPosition={analyzedComponents.composition.length ? decompose(world).position : undefined}
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
    );
}

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

function buildRepeatedInstances(
    gameObject: GameObjectType | null,
    modelPath: string | undefined,
) {
    if (!gameObject || !modelPath) return [];

    const modelProperties = findComponent(gameObject, "Model")?.properties ?? {};
    const counts: [number, number, number] = [1, 1, 1];
    const offsets: [number, number, number] = [0, 0, 0];

    if (modelProperties.repeat) {
        for (const entry of getRepeatAxesFromModelProperties(modelProperties)) {
            const axisIndex = entry.axis === 'x' ? 0 : entry.axis === 'y' ? 1 : 2;
            counts[axisIndex] = entry.count;
            offsets[axisIndex] = entry.offset;
        }
    }

    const instances: Array<{
        id: string;
        modelPath: string;
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
    }> = [];

    for (let x = 0; x < counts[0]; x++) {
        for (let y = 0; y < counts[1]; y++) {
            for (let z = 0; z < counts[2]; z++) {
                const isBaseInstance = x === 0 && y === 0 && z === 0;

                instances.push({
                    id: isBaseInstance ? gameObject.id : `${gameObject.id}__repeat_${x}_${y}_${z}`,
                    modelPath,
                    position: [x * offsets[0], y * offsets[1], z * offsets[2]],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                });
            }
        }
    }

    return instances;
}

function getNodeTransformProps(node?: GameObjectType | null) {
    const t = findComponent(node, "Transform")?.properties;
    return {
        position: t?.position ?? [0, 0, 0],
        rotation: t?.rotation ?? [0, 0, 0],
        scale: t?.scale ?? [1, 1, 1],
    };
}

function renderNodeContent(
    analyzedComponents: AnalyzedNodeComponents,
    childNodes?: React.ReactNode,
    skippedType?: string,
    enabled = true,
) {
    const components = analyzedComponents.composition.filter(component => (
        component.type !== skippedType && (enabled || component.renderWhenDisabled)
    ));
    let content = components
        .filter(component => component.attachment)
        .reduceRight<React.ReactNode>((children, { key, View, properties }) => (
            <View key={key} properties={properties} enabled={enabled}>
                {children}
            </View>
        ), childNodes);

    content = components
        .filter(component => component.object)
        .reduceRight<React.ReactNode>((children, { key, View, properties }) => (
            <View key={key} properties={properties} enabled={enabled}>
                {children}
            </View>
        ), content);

    return components
        .filter(component => !component.attachment && !component.object)
        .reduceRight<React.ReactNode>((children, { key, View, properties }) => (
            <View key={key} properties={properties} enabled={enabled}>
                {children}
            </View>
        ), content);
}

export default PrefabRoot;
