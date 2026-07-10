import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Matrix4 } from "three";
import type { Group, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useStore } from "zustand";
import { useClickValid } from "./useClickValid";

import { findComponent, getNodeUserData } from "./types";
import type { ComponentData, GameObject as GameObjectType, Prefab } from "./types";
import type { Component, ComponentViewProps } from "./components/ComponentRegistry";
import { getComponentDef } from "./components/ComponentRegistry";
import { loadModel, loadSound, loadTexture } from "../dragdrop";
import { GameInstanceBatch, GameInstanceProvider, getRepeatAxesFromModelProperties } from "./InstanceProvider";
import { composeTransform, decompose, withBasePath } from "./runtimeUtils";
import { createPrefabStore, PrefabStoreProvider, usePrefabChildIds, usePrefabNode, usePrefabRootId, usePrefabStoreApi } from "./prefabStore";
import type { PrefabStoreApi } from "./prefabStore";
import { AssetRuntimeProvider, NodeScope, useAssetRuntime } from "./assetRuntime";
import { gameEvents } from "./GameEvents";
import { useScene, type Scene } from "./SceneContext";
import { SceneProvider } from "./SceneProvider";
import { AudioRuntimeProvider } from "./AudioRuntime";
import { SelectionRuntimeProvider, useNodeSelected } from "./SelectionRuntime";
import {
    createNodeInteractionHandlers,
    type NodeInteractionEvent,
    type NodeInteractionEventType,
    type NodeInteractionHandlers,
} from "./usePointerEvents";

const IDENTITY = new Matrix4();

const EMPTY_NODE_COMPONENTS: AnalyzedNodeComponents = {
    geometry: undefined,
    materials: [],
    models: [],
    sprite: undefined,
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
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (eventType: NodeInteractionEventType, event: NodeInteractionEvent, node: GameObjectType) => void;
    onEditNodeClick?: (event: ThreeEvent<PointerEvent>, node: GameObjectType) => void;
    basePath?: string;
    /** Advanced: inject a Scene implementation, as PrefabEditor does for history-aware mutations. */
    scene?: Scene;
    /** Advanced: share Object3D/handle ids with a parent root. Assets are always shared. */
    shareRuntimeObjects?: boolean;
    children?: React.ReactNode;
}

type CompositionComponent = {
    key: string;
    View: NonNullable<Component["View"]>;
    properties: ComponentData["properties"];
};

type AnalyzedNodeComponents = {
    geometry: ComponentData | undefined;
    materials: Array<{ key: string; component: ComponentData }>;
    models: Array<{ key: string; component: ComponentData }>;
    sprite: ComponentData | undefined;
    clickEvent: ClickEventConfig;
    composition: CompositionComponent[];
};

type ClickEventConfig = {
    enabled: boolean;
    eventName: string | null;
};

export const PrefabRoot = forwardRef<Scene, PrefabRootProps>((props, ref) => {
    const { data, store } = props;
    const { selectedId, ...bodyProps } = props;
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
            <AssetRuntimeProvider isolateObjects={!props.shareRuntimeObjects}>
                <SceneProvider store={resolvedStore} scene={props.scene} editMode={props.editMode} basePath={props.basePath}>
                    <AudioRuntimeProvider>
                        <SelectionRuntimeProvider selectedId={selectedId}>
                            <PrefabRootBody ref={ref} {...bodyProps} />
                        </SelectionRuntimeProvider>
                    </AudioRuntimeProvider>
                </SceneProvider>
            </AssetRuntimeProvider>
        </PrefabStoreProvider>
    );
});

const PrefabRootBody = memo(forwardRef<Scene, PrefabRootProps>(({ editMode, onSelect, onPointerEvent, onEditNodeClick, basePath = "", children }, ref) => {
    const scene = useScene();
    const runtime = useAssetRuntime();
    const storeApi = usePrefabStoreApi();
    const assetRefCounts = useStore(storeApi, state => state.assetRefCounts);
    useImperativeHandle(ref, () => scene, [scene]);

    const loading = useRef(new Set<string>());

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
    ) => {
        const node = storeApi.getState().nodesById[nodeId];
        if (!node) return;
        const { clickEvent } = analyzeNodeComponents(node);
        emitNodePointerEvent(eventType, clickEvent.eventName, event, nodeId, node, fallbackObject);
        onPointerEvent?.(eventType, event, node);
    }, [onPointerEvent, storeApi]);

    return (
        <GameInstanceProvider
            editMode={editMode}
            onSelect={editMode ? onSelect : undefined}
            onPointerEvent={editMode ? undefined : handleNodePointerEvent}
            registerRef={runtime.registerObject}
            getObject={runtime.getObject}
        >
            <StoreRootNode
                onSelect={editMode ? onSelect : undefined}
                onPointerEvent={editMode ? undefined : handleNodePointerEvent}
                onEditNodeClick={editMode ? onEditNodeClick : undefined}
                registerRef={runtime.registerObject}
                editMode={editMode}
                parentMatrix={IDENTITY}
                basePath={basePath}
            />
            {children}
        </GameInstanceProvider>
    );
}));

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const rootId = usePrefabRootId();
    return <GameObjectRenderer {...props} nodeId={rootId} />;
}

function getClickEventConfig(component: ComponentData | undefined): ClickEventConfig {
    if (!component?.properties?.emitClickEvent) {
        return { enabled: false, eventName: null };
    }

    const eventName = component.properties.clickEventName;
    return {
        enabled: true,
        eventName: typeof eventName === 'string' && eventName.trim() ? eventName.trim() : null,
    };
}

function firstEnabledClickEvent(...configs: ClickEventConfig[]): ClickEventConfig {
    return configs.find(config => config.enabled) ?? { enabled: false, eventName: null };
}

function analyzeNodeComponents(node: GameObjectType): AnalyzedNodeComponents {
    let bufferGeometry: ComponentData | undefined;
    let geometry: ComponentData | undefined;
    const materials: Array<{ key: string; component: ComponentData }> = [];
    const models: Array<{ key: string; component: ComponentData }> = [];
    let sprite: ComponentData | undefined;
    const composition: CompositionComponent[] = [];

    for (const [key, component] of Object.entries(node.components ?? {})) {
        if (!component?.type) continue;

        switch (component.type) {
            case "Transform":
                break;
            case "BufferGeometry":
                bufferGeometry = component;
                break;
            case "Geometry":
                geometry = component;
                break;
            case "Material":
                materials.push({ key, component });
                break;
            case "Model":
                models.push({ key, component });
                break;
            case "Sprite":
                sprite = component;
                break;
            default: {
                const def = getComponentDef(component.type);
                if (!def?.View) break;

                composition.push({
                    key,
                    View: def.View,
                    properties: component.properties,
                });
                break;
            }
        }
    }

    return {
        geometry: bufferGeometry ?? geometry,
        materials,
        models,
        sprite,
        clickEvent: firstEnabledClickEvent(
            getClickEventConfig(bufferGeometry),
            getClickEventConfig(geometry),
            ...models.map(({ component }) => getClickEventConfig(component)),
            getClickEventConfig(sprite),
        ),
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
    const isInstanced = findComponent(node, "Model")?.properties?.instanced;

    if (!node || node.disabled) return null;

    const key = `${props.nodeId}_${isInstanced ? 'instanced' : 'standard'}`;
    return isInstanced
        ? <InstancedNode key={key} {...props} />
        : <StandardNode key={key} {...props} />;
}


function InstancedNode({
    nodeId,
    parentMatrix = IDENTITY,
    editMode,
    registerRef,
    onSelect,
    onPointerEvent,
    onEditNodeClick,
    isVisible = true,
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
    const isLocked = Boolean(gameObject?.locked);
    const isSelected = useNodeSelected(nodeId);

    const modelComponent = analyzedComponents.models[0]?.component;
    const modelUrl = modelComponent?.properties?.filename
        ? withBasePath(basePath, modelComponent.properties.filename)
        : undefined;
    const instances = useMemo(
        () => buildRepeatedInstances(gameObject, modelUrl),
        [gameObject?.id, modelComponent, modelUrl]
    );

    const groupRef = useRef<Group>(null);
    const handleGroupRef = useCallback((object: Group | null) => {
        groupRef.current = object;
        registerRef(nodeId, object);
    }, [nodeId, registerRef]);

    const editClickHandlers = useClickValid(!!editMode && !isLocked, (event: ThreeEvent<PointerEvent>) => {
        if (!gameObject) return;
        onSelect?.(nodeId);
        onEditNodeClick?.(event, gameObject);
    });

    if (!gameObject) return null;

    const nodeVisible = isVisible && !gameObject.hidden;
    const world = useMemo(
        () => parentMatrix.clone().multiply(composeTransform(localTransform.position, localTransform.rotation, localTransform.scale)),
        [parentMatrix, transformComponent],
    );
    const worldTransform = decompose(world);
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
        locked: isLocked,
        clickEnabled: analyzedComponents.clickEvent.enabled,
    })), [analyzedComponents.clickEvent.enabled, instances, isLocked, nodeVisible]);
    const renderedInstances = (
        <GameInstanceBatch
            sourceId={gameObject.id}
            instances={instanceBatch}
        />
    );
    const childNodes = (
        <ChildNodes
            childIds={childIds}
            parentMatrix={world}
            onSelect={onSelect}
            onPointerEvent={onPointerEvent}
            onEditNodeClick={onEditNodeClick}
            registerRef={registerRef}
            editMode={editMode}
            isVisible={nodeVisible}
            basePath={basePath}
        />
    );
    const componentRuntimeProps: ComponentRuntimeProps = {
        editMode,
        nodeInteractionHandlers: editMode ? editClickHandlers : undefined,
        position: localTransform.position,
        rotation: localTransform.rotation,
        scale: localTransform.scale,
        worldPosition: worldTransform.position,
    };
    let logicalContent: React.ReactNode = childNodes;
    for (const { key, View, properties } of analyzedComponents.composition) {
        logicalContent = (
            <View key={key} properties={properties} basePath={basePath} {...componentRuntimeProps}>
                {logicalContent}
            </View>
        );
    }

    return (
        <NodeScope nodeId={nodeId} editMode={editMode} isSelected={isSelected}>
            <group
                ref={handleGroupRef}
                {...groupProps}
                {...(editMode ? editClickHandlers : undefined)}
            >
                {editMode ? (
                    <mesh visible={false}>
                        <boxGeometry args={[0.01, 0.01, 0.01]} />
                    </mesh>
                ) : null}
                {logicalContent}
            </group>
            {renderedInstances}
        </NodeScope>
    );
}

function StandardNode({
    nodeId,
    onSelect,
    onPointerEvent,
    onEditNodeClick,
    registerRef,
    editMode,
    parentMatrix = IDENTITY,
    isVisible = true,
    basePath = "",
}: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    const childIds = usePrefabChildIds(nodeId);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject) : EMPTY_NODE_COMPONENTS,
        [gameObject],
    );
    const isSelected = useNodeSelected(nodeId);
    const isLocked = Boolean(gameObject?.locked);
    const transformComponent = findComponent(gameObject, "Transform");
    const transform = getNodeTransformProps(gameObject);

    const groupRef = useRef<Object3D | null>(null);
    const handleGroupRef = useCallback((object: Object3D | null) => {
        groupRef.current = object;
        registerRef(nodeId, object);
    }, [nodeId, registerRef]);

    const editClickHandlers = useClickValid(!!editMode && !isLocked, (event: ThreeEvent<PointerEvent>) => {
        if (!gameObject) return;
        onSelect?.(nodeId);
        onEditNodeClick?.(event, gameObject);
    });
    const primaryInteractionHandlers = !editMode && analyzedComponents.clickEvent.enabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, nodeId, groupRef.current);
        })
        : undefined;

    const world = useMemo(
        () => parentMatrix.clone().multiply(composeTransform(transform.position, transform.rotation, transform.scale)),
        [parentMatrix, transformComponent],
    );

    if (!gameObject) return null;

    const nodeVisible = isVisible && !gameObject.hidden;
    const metadataProps = getNodeMetadataProps(gameObject);

    const transformProps = {
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
    };
    const worldTransform = decompose(world);
    const groupProps = {
        ...metadataProps,
        ...transformProps,
    };
    const childNodes = <ChildNodes childIds={childIds} parentMatrix={world}
        onSelect={onSelect} onPointerEvent={onPointerEvent} onEditNodeClick={onEditNodeClick}
        registerRef={registerRef}
        editMode={editMode}
        isVisible={nodeVisible}
        basePath={basePath}
    />;

    const nodeInteractionHandlers = editMode ? editClickHandlers : primaryInteractionHandlers;
    const componentRuntimeProps: ComponentRuntimeProps = {
        editMode,
        nodeInteractionHandlers,
        ...transformProps,
        worldPosition: worldTransform.position,
    };
    const inner = renderNodeContent(
        analyzedComponents,
        primaryInteractionHandlers,
        childNodes,
        basePath,
        componentRuntimeProps,
    );
    const editAnchor = editMode ? (
        <mesh visible={false}>
            <boxGeometry args={[0.01, 0.01, 0.01]} />
        </mesh>
    ) : null;
    const standardNode = (
        <group
            ref={handleGroupRef}
            {...groupProps}
            visible={nodeVisible}
            {...(editMode ? editClickHandlers : undefined)}
        >
            {editAnchor}
            {inner}
        </group>
    );

    return (
        <NodeScope nodeId={nodeId} editMode={editMode} isSelected={isSelected}>
            {standardNode}
        </NodeScope>
    );
}

interface RendererProps {
    nodeId: string;
    onSelect?: (id: string) => void;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
    ) => void;
    onEditNodeClick?: (event: ThreeEvent<PointerEvent>, node: GameObjectType) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    editMode?: boolean;
    parentMatrix?: Matrix4;
    isVisible?: boolean;
    basePath?: string;
}

type PrimaryInteractionHandlers = NodeInteractionHandlers;
type ComponentRuntimeProps = Pick<ComponentViewProps, "editMode" | "nodeInteractionHandlers" | "position" | "rotation" | "scale" | "worldPosition">;

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

function getModelRepeatSettings(node?: GameObjectType | null) {
    const properties = findComponent(node, "Model")?.properties ?? {};
    return {
        repeat: Boolean(properties.repeat),
        repeatAxes: getRepeatAxesFromModelProperties(properties),
    };
}

function buildRepeatedInstances(
    gameObject: GameObjectType | null,
    modelUrl: string | undefined,
) {
    if (!gameObject || !modelUrl) return [];

    const transform = getNodeTransformProps(gameObject);
    const repeat = getModelRepeatSettings(gameObject);
    const counts: [number, number, number] = [1, 1, 1];
    const offsets: [number, number, number] = [0, 0, 0];

    if (repeat.repeat) {
        for (const entry of repeat.repeatAxes) {
            const axisIndex = entry.axis === 'x' ? 0 : entry.axis === 'y' ? 1 : 2;
            counts[axisIndex] = entry.count;
            offsets[axisIndex] = entry.offset;
        }
    }

    const instances: Array<{
        id: string;
        modelUrl: string;
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
                    modelUrl,
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
    primaryInteractionHandlers?: PrimaryInteractionHandlers,
    childNodes?: React.ReactNode,
    basePath = "",
    componentRuntimeProps?: ComponentRuntimeProps,
) {
    const geometry = analyzedComponents.geometry;
    const models = analyzedComponents.models;
    const materials = analyzedComponents.materials;
    const primaryMaterial = materials[0]?.component;
    const sprite = analyzedComponents.sprite;
    const shapeKind = sprite?.type ? 'sprite' : geometry?.type ? 'mesh' : models.length > 0 ? 'model' : 'none';
    let materialContent: React.ReactNode = null;

    switch (shapeKind) {
        case 'sprite': {
            const materialDef = primaryMaterial?.type ? getComponentDef(primaryMaterial.type) : undefined;
            if (primaryMaterial?.properties && materialDef?.View) {
                const materialIsSprite = primaryMaterial.properties.materialType === 'sprite';
                materialContent = (
                    <materialDef.View
                        key={materials[0]?.key ?? 'material'}
                        properties={{
                            ...primaryMaterial.properties,
                            materialType: 'sprite',
                            attach: 'material',
                            transparent: materialIsSprite ? primaryMaterial.properties.transparent : true,
                            depthTest: materialIsSprite ? primaryMaterial.properties.depthTest : false,
                            depthWrite: materialIsSprite ? primaryMaterial.properties.depthWrite : false,
                        }}
                        basePath={basePath}
                    />
                );
            }
            break;
        }
        case 'mesh': {
            materialContent = materials.map(({ key, component }) => {
                const materialDef = component.type ? getComponentDef(component.type) : undefined;
                if (!component.properties || !materialDef?.View) return null;
                return <materialDef.View key={key} properties={component.properties} basePath={basePath} />;
            });
            break;
        }
    }

    let primaryContent: React.ReactNode = null;
    let contentChildren = childNodes;
    const modelContent = models.map(({ key, component }) => {
        if (!component.type || component.properties?.instanced) return null;

        const modelDef = getComponentDef(component.type);
        if (!modelDef?.View) return null;

        return <modelDef.View key={key} properties={component.properties} basePath={basePath} />;
    });

    switch (shapeKind) {
        case 'sprite': {
            primaryContent = (
                <sprite
                    center={sprite?.properties?.center ?? [0.5, 0.5]}
                    {...primaryInteractionHandlers}
                >
                    {materialContent}
                    {childNodes}
                </sprite>
            );
            contentChildren = null;
            break;
        }
        case 'mesh': {
            const geometryDef = geometry?.type ? getComponentDef(geometry.type) : undefined;
            if (!geometry?.properties || !geometryDef?.View) break;

            const GeometryView = geometryDef.View;
            const geometryProperties = geometry.properties ?? {};
            const visible = geometryProperties.visible !== false;

            primaryContent = (
                <mesh
                    visible={visible}
                    castShadow={visible && geometryProperties.castShadow !== false}
                    receiveShadow={visible && geometryProperties.receiveShadow !== false}
                    {...primaryInteractionHandlers}
                >
                    <GeometryView properties={geometry.properties} basePath={basePath} />
                    {materialContent}
                </mesh>
            );
            break;
        }
        case 'model': {
            primaryContent = primaryInteractionHandlers ? <group {...primaryInteractionHandlers}>{modelContent}</group> : modelContent;
            break;
        }
    }

    if (shapeKind !== 'model' && modelContent.some(Boolean)) {
        primaryContent = <>{primaryContent}{modelContent}</>;
    }

    let content: React.ReactNode = <>{primaryContent}{contentChildren}</>;
    for (const { key, View, properties } of analyzedComponents.composition) {
        content = (
            <View key={key} properties={properties} basePath={basePath} {...componentRuntimeProps}>
                {content}
            </View>
        );
    }

    return content;
}

export default PrefabRoot;
