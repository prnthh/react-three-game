import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Euler, Matrix4 } from "three";
import type { Group, Object3D } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useStore } from "zustand";
import { useClickValid } from "./useClickValid";

import { findComponent, getNodeUserData } from "./types";
import type { ComponentData, GameObject as GameObjectType, Prefab } from "./types";
import type { Component, ComponentViewProps } from "./components/ComponentRegistry";
import { getComponentDef, registerComponent } from "./components/ComponentRegistry";
import { builtinComponents } from "./components";
import { loadModel, loadSound, loadTexture } from "../dragdrop";
import type { LoadedModels } from "../dragdrop";
import { GameInstance, GameInstanceProvider, getRepeatAxesFromModelProperties } from "./InstanceProvider";
import { composeTransform, decompose, withBasePath } from "./runtimeUtils";
import { createPrefabStore, PrefabStoreProvider, usePrefabChildIds, usePrefabNode, usePrefabRootId, usePrefabStoreApi } from "./prefabStore";
import type { PrefabStoreApi } from "./prefabStore";
import { AssetRuntimeProvider, NodeScope, useAllModels, useAssetRuntime } from "./assetRuntime";
import { gameEvents } from "./GameEvents";
import { useScene, type Scene } from "./SceneContext";
import { SceneProvider } from "./SceneProvider";

const IDENTITY = new Matrix4();

// Reusable scratch objects for buildRepeatedInstances. The matrices are pure
// intermediates (their results are read out into plain arrays per instance),
// so they can be shared across calls instead of allocating fresh Matrix4s in
// nested loops for every repeated instance.
const _scratchTranslation = new Matrix4();
const _scratchRotation = new Matrix4();
const _scratchScale = new Matrix4();
const _scratchOffset = new Matrix4();
const _scratchWorld = new Matrix4();
const _scratchEuler = new Euler();

builtinComponents.forEach((component) => {
    if (!getComponentDef(component.name)) registerComponent(component);
});

const EMPTY_NODE_COMPONENTS: AnalyzedNodeComponents = {
    geometry: undefined,
    materials: [],
    models: [],
    sprite: undefined,
    clickEventName: null,
    composition: [],
};

/** Check if a model component's assets are loaded. */
function isNodeReady(model: ComponentData | undefined, loadedModels: LoadedModels): boolean {
    if (!model?.properties?.filename) return true;
    return Boolean(loadedModels[model.properties.filename]);
}

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
    onClick?: (event: ThreeEvent<PointerEvent>, node: GameObjectType) => void;
    onEditNodeClick?: (event: ThreeEvent<PointerEvent>, node: GameObjectType) => void;
    basePath?: string;
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
    clickEventName: string | null;
    composition: CompositionComponent[];
};

export const PrefabRoot = forwardRef<Scene, PrefabRootProps>((props, ref) => {
    const { data, store } = props;
    const [ownedStore] = useState<PrefabStoreApi | null>(() => {
        if (store) return null;
        if (data) return createPrefabStore(data);
        throw new Error("PrefabRoot requires either a `data` or `store` prop");
    });
    const resolvedStore = store ?? ownedStore;
    if (!resolvedStore) throw new Error("PrefabRoot requires either a `data` or `store` prop");

    useEffect(() => {
        if (!store && data) resolvedStore.getState().replacePrefab(data);
    }, [data, resolvedStore, store]);

    return (
        <PrefabStoreProvider store={resolvedStore}>
            <AssetRuntimeProvider>
                <SceneProvider store={resolvedStore} editMode={props.editMode} basePath={props.basePath}>
                    <PrefabRootBody ref={ref} {...props} />
                </SceneProvider>
            </AssetRuntimeProvider>
        </PrefabStoreProvider>
    );
});

const PrefabRootBody = forwardRef<Scene, PrefabRootProps>(({ editMode, selectedId, onSelect, onClick, onEditNodeClick, basePath = "", children }, ref) => {
    const scene = useScene();
    const runtime = useAssetRuntime();
    const models = useAllModels();
    const storeApi = usePrefabStoreApi();
    const assetRefCounts = useStore(storeApi, state => state.assetRefCounts);
    useImperativeHandle(ref, () => scene, [scene]);

    const loading = useRef(new Set<string>());
    const failed = useRef(new Set<string>());

    useEffect(() => {
        const tryLoad = (key: string, hasLoaded: boolean, run: () => Promise<{ success: boolean; error?: unknown }>) => {
            if (hasLoaded || loading.current.has(key) || failed.current.has(key)) return;
            loading.current.add(key);
            void run().then(result => {
                loading.current.delete(key);
                if (!result.success) {
                    console.warn(`Failed to load asset: ${key}`, result.error);
                    failed.current.add(key);
                }
            });
        };

        Object.keys(assetRefCounts).forEach(entry => {
            const sep = entry.indexOf(':');
            const type = entry.slice(0, sep);
            const file = entry.slice(sep + 1);
            const path = withBasePath(basePath, file);

            if (type === 'model') {
                tryLoad(entry, !!runtime.getModel(file), async () => {
                    const r = await loadModel(path);
                    if (r.success && r.model) runtime.registerModel(file, r.model);
                    return r;
                });
            } else if (type === 'texture') {
                tryLoad(entry, !!runtime.getTexture(file), async () => {
                    const r = await loadTexture(path);
                    if (r.success && r.texture) runtime.registerTexture(file, r.texture);
                    return r;
                });
            } else if (type === 'sound') {
                tryLoad(entry, !!runtime.getSound(file), async () => {
                    const r = await loadSound(path);
                    if (r.success && r.sound) runtime.registerSound(file, r.sound);
                    return r;
                });
            }
        });
    }, [assetRefCounts, basePath, runtime]);

    const handleNodeClick = useCallback((event: ThreeEvent<PointerEvent>, nodeId: string, fallbackObject: Object3D | null) => {
        const node = storeApi.getState().nodesById[nodeId];
        if (!node) return;
        const { clickEventName } = analyzeNodeComponents(node);
        emitNodePointerEvent(clickEventName, event, nodeId, node, fallbackObject);
        onClick?.(event, node);
    }, [onClick, storeApi]);

    return (
        <GameInstanceProvider
            models={models}
            selectedId={selectedId}
            editMode={editMode}
            onSelect={editMode ? onSelect : undefined}
            onClick={editMode ? undefined : handleNodeClick}
            registerRef={runtime.registerObject}
        >
            <StoreRootNode
                selectedId={selectedId}
                onSelect={editMode ? onSelect : undefined}
                onClick={editMode ? undefined : handleNodeClick}
                onEditNodeClick={editMode ? onEditNodeClick : undefined}
                registerRef={runtime.registerObject}
                loadedModels={models}
                editMode={editMode}
                parentMatrix={IDENTITY}
                basePath={basePath}
            />
            {children}
        </GameInstanceProvider>
    );
});

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const rootId = usePrefabRootId();
    return <GameObjectRenderer {...props} nodeId={rootId} />;
}

function getClickEventName(component: ComponentData | undefined) {
    if (!component?.properties?.emitClickEvent) return null;

    const eventName = component.properties.clickEventName;
    return typeof eventName === 'string' && eventName.trim() ? eventName.trim() : null;
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
        clickEventName: getClickEventName(bufferGeometry) ?? getClickEventName(geometry) ?? models.map(({ component }) => getClickEventName(component)).find(Boolean) ?? getClickEventName(sprite),
        composition,
    };
}

function emitNodePointerEvent(
    eventName: string | null,
    event: ThreeEvent<PointerEvent>,
    nodeId: string,
    node: GameObjectType,
    fallbackObject: Object3D | null,
) {
    const payload = {
        sourceEntityId: nodeId,
        sourceNodeId: nodeId,
        nodeId,
        node,
        object: event.object ?? fallbackObject,
        point: [event.point.x, event.point.y, event.point.z] as [number, number, number],
        button: event.button,
        altKey: event.nativeEvent.altKey,
        ctrlKey: event.nativeEvent.ctrlKey,
        metaKey: event.nativeEvent.metaKey,
        shiftKey: event.nativeEvent.shiftKey,
        r3fEvent: event,
    };

    gameEvents.emit('click', payload);

    const trimmedEventName = eventName?.trim();
    if (!trimmedEventName) return;

    gameEvents.emit(trimmedEventName, payload);
}

export function GameObjectRenderer(props: RendererProps) {
    const node = usePrefabNode(props.nodeId);
    const isInstanced = findComponent(node, "Model")?.properties?.instanced;
    const prevInstancedRef = useRef<boolean | undefined>(undefined);
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        if (prevInstancedRef.current !== undefined && prevInstancedRef.current !== isInstanced) {
            setIsTransitioning(true);
            const timer = setTimeout(() => setIsTransitioning(false), 100);
            prevInstancedRef.current = isInstanced;
            return () => clearTimeout(timer);
        }
        prevInstancedRef.current = isInstanced;
    }, [isInstanced]);

    if (!node || node.disabled || isTransitioning) return null;

    const key = `${props.nodeId}_${isInstanced ? 'instanced' : 'standard'}`;
    return isInstanced
        ? <InstancedNode key={key} {...props} />
        : <StandardNode key={key} {...props} />;
}


function InstancedNode({ nodeId, parentMatrix = IDENTITY, editMode, registerRef, onSelect, onEditNodeClick, onClick, isVisible = true }: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    const analyzedComponents = useMemo(
        () => gameObject ? analyzeNodeComponents(gameObject) : EMPTY_NODE_COMPONENTS,
        [gameObject],
    );
    const localTransform = getNodeTransformProps(gameObject);
    const isLocked = Boolean(gameObject?.locked);

    const modelUrl = analyzedComponents.models[0]?.component.properties?.filename;
    const instances = useMemo(
        () => buildRepeatedInstances(gameObject, parentMatrix, modelUrl),
        [gameObject, modelUrl, parentMatrix]
    );

    const groupRef = useRef<Group>(null);
    const handleGroupRef = useCallback((object: Group | null) => {
        groupRef.current = object;
        if (editMode) {
            registerRef(nodeId, object);
        }
    }, [editMode, nodeId, registerRef]);

    const editClickHandlers = useClickValid(!!editMode && !isLocked, (event: ThreeEvent<PointerEvent>) => {
        if (!gameObject) return;
        onSelect?.(nodeId);
        onEditNodeClick?.(event, gameObject);
    });

    if (!gameObject) return null;

    const nodeVisible = isVisible && !gameObject.hidden;
    const groupProps = {
        ...getNodeMetadataProps(gameObject),
        visible: nodeVisible,
        position: localTransform.position,
        rotation: localTransform.rotation,
        scale: localTransform.scale,
    };

    const renderedInstances = instances.map(instance => (
        <GameInstance
            key={instance.id}
            id={instance.id}
            sourceId={gameObject.id}
            modelUrl={instance.modelUrl}
            position={instance.position}
            rotation={instance.rotation}
            scale={instance.scale}
            visible={nodeVisible}
            locked={isLocked}
            onClick={onClick}
        />
    ));

    if (editMode) {
        return (
            <>
                <group
                    ref={handleGroupRef}
                    {...groupProps}
                    {...editClickHandlers}
                >
                    <mesh visible={false}>
                        <boxGeometry args={[0.01, 0.01, 0.01]} />
                    </mesh>
                </group>
                {renderedInstances}
            </>
        );
    }

    return <>{renderedInstances}</>;
}

function StandardNode({
    nodeId,
    selectedId,
    onSelect,
    onClick,
    onEditNodeClick,
    registerRef,
    loadedModels,
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
    const isSelected = selectedId === nodeId;
    const isLocked = Boolean(gameObject?.locked);

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
    const primaryClickHandlers = !editMode && onClick
        ? {
            onClick: (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                onClick(event, nodeId, groupRef.current);
            },
        }
        : undefined;

    const world = parentMatrix.clone().multiply(compose(gameObject));

    if (!gameObject) return null;

    const nodeVisible = isVisible && !gameObject.hidden;
    const metadataProps = getNodeMetadataProps(gameObject);

    const transform = getNodeTransformProps(gameObject);
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
        selectedId={selectedId} onSelect={onSelect} onClick={onClick} onEditNodeClick={onEditNodeClick}
        registerRef={registerRef}
        loadedModels={loadedModels} editMode={editMode}
        isVisible={nodeVisible}
        basePath={basePath}
    />;

    const nodeInteractionHandlers = editMode ? editClickHandlers : primaryClickHandlers;
    const componentRuntimeProps: ComponentRuntimeProps = {
        editMode,
        nodeInteractionHandlers,
        ...transformProps,
        worldPosition: worldTransform.position,
    };
    const inner = renderNodeContent(
        analyzedComponents,
        loadedModels,
        primaryClickHandlers,
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
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, nodeId: string, object: Object3D | null) => void;
    onEditNodeClick?: (event: ThreeEvent<PointerEvent>, node: GameObjectType) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    loadedModels: LoadedModels;
    editMode?: boolean;
    parentMatrix?: Matrix4;
    isVisible?: boolean;
    basePath?: string;
}

type PrimaryClickHandlers = { onClick?: (event: ThreeEvent<PointerEvent>) => void };
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

function compose(node?: GameObjectType | null) {
    const { position, rotation, scale } = getNodeTransformProps(node);
    return composeTransform(position, rotation, scale);
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
    parentMatrix: Matrix4,
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

    const baseTranslation = _scratchTranslation.makeTranslation(transform.position[0], transform.position[1], transform.position[2]);
    const baseRotation = _scratchRotation.makeRotationFromEuler(_scratchEuler.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]));
    const baseScale = _scratchScale.makeScale(transform.scale[0], transform.scale[1], transform.scale[2]);
    const offsetMatrix = _scratchOffset;
    const worldMatrix = _scratchWorld;
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
                offsetMatrix.makeTranslation(
                    x * offsets[0],
                    y * offsets[1],
                    z * offsets[2],
                );

                worldMatrix.copy(parentMatrix)
                    .multiply(baseTranslation)
                    .multiply(baseRotation)
                    .multiply(offsetMatrix)
                    .multiply(baseScale);

                const { position, rotation, scale } = decompose(worldMatrix);
                const isBaseInstance = x === 0 && y === 0 && z === 0;

                instances.push({
                    id: isBaseInstance ? gameObject.id : `${gameObject.id}__repeat_${x}_${y}_${z}`,
                    modelUrl,
                    position,
                    rotation,
                    scale,
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
    loadedModels: LoadedModels,
    primaryClickHandlers?: PrimaryClickHandlers,
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
                    />
                );
            }
            break;
        }
        case 'mesh': {
            materialContent = materials.map(({ key, component }) => {
                const materialDef = component.type ? getComponentDef(component.type) : undefined;
                if (!component.properties || !materialDef?.View) return null;
                return <materialDef.View key={key} properties={component.properties} />;
            });
            break;
        }
    }

    let primaryContent: React.ReactNode = null;
    let contentChildren = childNodes;
    const modelContent = models.map(({ key, component }) => {
        if (!component.type || component.properties?.instanced || !isNodeReady(component, loadedModels)) return null;

        const modelDef = getComponentDef(component.type);
        if (!modelDef?.View) return null;

        return <modelDef.View key={key} properties={component.properties} />;
    });

    switch (shapeKind) {
        case 'sprite': {
            primaryContent = (
                <sprite
                    center={sprite?.properties?.center ?? [0.5, 0.5]}
                    {...primaryClickHandlers}
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
                    {...primaryClickHandlers}
                >
                    <GeometryView properties={geometry.properties} />
                    {materialContent}
                </mesh>
            );
            break;
        }
        case 'model': {
            primaryContent = primaryClickHandlers ? <group {...primaryClickHandlers}>{modelContent}</group> : modelContent;
            break;
        }
    }

    if (shapeKind !== 'model' && modelContent.some(Boolean)) {
        primaryContent = <>{primaryContent}{modelContent}</>;
    }

    let content = <>{primaryContent}{contentChildren}</>;
    for (const { key, View, properties } of analyzedComponents.composition) {
        content = (
            <View
                key={key}
                properties={properties}
                basePath={basePath}
                {...componentRuntimeProps}
            >
                {content}
            </View>
        );
    }

    return content;
}

export default PrefabRoot;
