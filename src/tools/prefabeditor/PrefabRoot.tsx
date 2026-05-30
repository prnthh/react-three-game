import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Euler, Matrix4 } from "three";
import type { Camera, Group, Object3D, Texture, WebGLRenderer } from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useStore } from "zustand";
import { useClickValid } from "./useClickValid";

import { findComponent, getNodeUserData } from "./types";
import type { ComponentData, GameObject as GameObjectType, Prefab } from "./types";
import type { Component, ComponentViewProps } from "./components/ComponentRegistry";
import { getComponentDef } from "./components/ComponentRegistry";
import { loadModel, loadSound, loadTexture } from "../dragdrop";
import type { LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { GameInstance, GameInstanceProvider, getRepeatAxesFromModelProperties } from "./InstanceProvider";
import { composeTransform, decompose, withBasePath } from "./runtimeUtils";
import { createPrefabStore, PrefabStoreProvider, usePrefabChildIds, usePrefabNode, usePrefabRootId } from "./prefabStore";
import type { PrefabStoreApi } from "./prefabStore";
import { AssetRuntimeContext, NodeScope } from "./assetRuntime";
import type { AssetRuntime } from "./assetRuntime";
import { gameEvents } from "./GameEvents";
import { sound as soundManager } from "../../helpers/SoundManager";
import { PrefabEditorMode, SceneContext, type Scene } from "./SceneContext";

const IDENTITY = new Matrix4();
const EMPTY_NODE_COMPONENTS: AnalyzedNodeComponents = {
    geometry: undefined,
    materials: [],
    models: [],
    sprite: undefined,
    clickEventName: null,
    composition: [],
};

async function precompileModel(model: Object3D, renderer: WebGLRenderer, camera: Camera) {
    try {
        if (typeof renderer.compileAsync === "function") {
            await renderer.compileAsync(model, camera);
            return;
        }

        renderer.compile(model, camera);
    } catch (error) {
        console.warn("Failed to precompile model before adding it to the scene", error);
    }
}

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

export const PrefabRoot = forwardRef<Scene, PrefabRootProps>(({ editMode, data, store, selectedId, onSelect, onClick, onEditNodeClick, basePath = "", children }, ref) => {

    const parentScene = useContext(SceneContext);
    const parentAssetRuntime = useContext(AssetRuntimeContext);
    const renderer = useThree(state => state.gl);
    const camera = useThree(state => state.camera);
    const [models, setModels] = useState<LoadedModels>({});
    const [textures, setTextures] = useState<LoadedTextures>({});
    const [sounds, setSounds] = useState<LoadedSounds>({});
    const loading = useRef(new Set<string>());
    const failedModels = useRef(new Set<string>());
    const failedTextures = useRef(new Set<string>());
    const failedSounds = useRef(new Set<string>());
    const injectedModelVersions = useRef<Record<string, number>>({});
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const nodeHandles = useRef<Map<string, Map<string, unknown>>>(new Map());
    const [ownedStore] = useState<PrefabStoreApi | null>(() => {
        if (store) return null;
        if (data) return createPrefabStore(data);
        throw new Error("PrefabRoot requires either a `data` or `store` prop");
    });
    const resolvedStore = store ?? ownedStore;
    if (!resolvedStore) {
        throw new Error("PrefabRoot requires either a `data` or `store` prop");
    }
    const usesOwnedStore = resolvedStore === ownedStore;
    const rootId = useStore(resolvedStore, state => state.rootId);
    const assetRefCounts = useStore(resolvedStore, state => state.assetRefCounts);

    const getModel = useCallback((path: string) => models[path] ?? parentAssetRuntime?.getModel(path) ?? null, [models, parentAssetRuntime]);
    const getTexture = useCallback((path: string) => textures[path] ?? parentAssetRuntime?.getTexture(path) ?? null, [parentAssetRuntime, textures]);
    const getSound = useCallback((path: string) => sounds[path] ?? parentAssetRuntime?.getSound(path) ?? null, [parentAssetRuntime, sounds]);
    const assetRevision = useMemo(
        () => `${parentAssetRuntime?.getAssetRevision() ?? ""}::${Object.keys(textures).sort().join('|')}::${Object.keys(models).sort().join('|')}`,
        [models, parentAssetRuntime, textures],
    );

    const getObject = useCallback((id: string) => {
        return objectRefs.current[id] ?? parentAssetRuntime?.getObject(id) ?? null;
    }, [parentAssetRuntime]);

    const getHandle = useCallback(<T = unknown,>(id: string, kind: string) => {
        return (nodeHandles.current.get(id)?.get(kind) as T | undefined) ?? parentAssetRuntime?.getHandle<T>(id, kind) ?? null;
    }, [parentAssetRuntime]);

    const getNode = useCallback((nodeId: string) => {
        return resolvedStore.getState().nodesById[nodeId] ?? null;
    }, [resolvedStore]);

    const registerHandle = useCallback((id: string, kind: string, handle: unknown) => {
        const current = nodeHandles.current.get(id);

        if (handle == null) {
            parentAssetRuntime?.registerHandle(id, kind, null);
            if (!current) return;
            current.delete(kind);
            if (current.size === 0) {
                nodeHandles.current.delete(id);
            }
            return;
        }

        if (current) {
            current.set(kind, handle);
            parentAssetRuntime?.registerHandle(id, kind, handle);
            return;
        }

        nodeHandles.current.set(id, new Map([[kind, handle]]));
        parentAssetRuntime?.registerHandle(id, kind, handle);
    }, [parentAssetRuntime]);

    const registerObject = useCallback((id: string, obj: Object3D | null) => {
        if (obj) {
            objectRefs.current[id] = obj;
        } else {
            delete objectRefs.current[id];
        }
        parentAssetRuntime?.registerObject(id, obj);
    }, [parentAssetRuntime]);

    const registerModel = useCallback((path: string, model: Object3D) => {
        parentAssetRuntime?.registerModel(path, model);
        setModels(prev => prev[path] === model ? prev : { ...prev, [path]: model });
    }, [parentAssetRuntime]);

    const registerTexture = useCallback((path: string, texture: Texture) => {
        parentAssetRuntime?.registerTexture(path, texture);
        setTextures(prev => prev[path] === texture ? prev : { ...prev, [path]: texture });
    }, [parentAssetRuntime]);

    const registerSound = useCallback((path: string, sound: AudioBuffer) => {
        parentAssetRuntime?.registerSound(path, sound);
        soundManager.setBuffer(path, sound);
        setSounds(prev => prev[path] === sound ? prev : { ...prev, [path]: sound });
    }, [parentAssetRuntime]);

    const sceneValue = useMemo<Scene>(() => ({
        get root() {
            return objectRefs.current[rootId] ?? null;
        },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
        basePath,
        get: getNode,
        getObject,
        getHandle,
        getModel,
        add: (node, parentId) => {
            const state = resolvedStore.getState();
            state.addChild(parentId ?? state.rootId, node);
            return node;
        },
        update: (id, fn) => resolvedStore.getState().updateNode(id, fn),
        replaceNode: (id, node) => resolvedStore.getState().replaceNode(id, node),
        remove: (id) => resolvedStore.getState().deleteNode(id),
        duplicate: (id) => resolvedStore.getState().duplicateNode(id),
        move: (draggedId, targetId, position) => resolvedStore.getState().moveNode(draggedId, targetId, position),
        replace: (prefab) => resolvedStore.getState().replacePrefab(prefab),
        addModel: (path, model) => {
            const version = (injectedModelVersions.current[path] ?? 0) + 1;
            injectedModelVersions.current[path] = version;
            void precompileModel(model, renderer, camera).then(() => {
                if (injectedModelVersions.current[path] !== version) return;
                registerModel(path, model);
            });
        },
        addTexture: registerTexture,
        addSound: registerSound,
    }), [basePath, camera, editMode, getHandle, getModel, getNode, getObject, registerModel, registerSound, registerTexture, renderer, resolvedStore, rootId]);

    useImperativeHandle(ref, () => sceneValue, [sceneValue]);

    useEffect(() => {
        if (usesOwnedStore && data) {
            resolvedStore.getState().replacePrefab(data);
        }
    }, [data, resolvedStore, usesOwnedStore]);

    useEffect(() => {
        const loadAsset = <T,>(
            file: string,
            loaded: Record<string, T>,
            failed: Set<string>,
            loader: (path: string) => Promise<{ success: boolean; error?: unknown }>,
        ) => {
            if (loaded[file] || loading.current.has(file) || failed.has(file)) return;
            loading.current.add(file);
            void loader(withBasePath(basePath, file)).then(result => {
                loading.current.delete(file);
                if (!result.success) {
                    console.warn(`Failed to load asset: ${file}`, result.error);
                    failed.add(file);
                }
            });
        };

        Object.keys(assetRefCounts).forEach(entry => {
            const separator = entry.indexOf(':');
            const type = entry.slice(0, separator);
            const file = entry.slice(separator + 1);

            if (type === 'model') {
                const inheritedModel = models[file] ? null : parentAssetRuntime?.getModel(file);
                if (inheritedModel) {
                    registerModel(file, inheritedModel);
                    return;
                }

                loadAsset(file, models, failedModels.current, path =>
                    loadModel(path).then(async result => {
                        const loadedModel = result.model;
                        if (result.success && loadedModel) {
                            await precompileModel(loadedModel, renderer, camera);
                            registerModel(file, loadedModel);
                        }
                        return result;
                    }),
                );
            } else if (type === 'texture') {
                const inheritedTexture = textures[file] ? null : parentAssetRuntime?.getTexture(file);
                if (inheritedTexture) {
                    registerTexture(file, inheritedTexture);
                    return;
                }

                loadAsset(file, textures, failedTextures.current, path =>
                    loadTexture(path).then(result => {
                        const loadedTexture = result.texture;
                        if (result.success && loadedTexture) {
                            registerTexture(file, loadedTexture);
                        }
                        return result;
                    }),
                );
            } else if (type === 'sound') {
                const inheritedSound = sounds[file] ? null : parentAssetRuntime?.getSound(file);
                if (inheritedSound) {
                    registerSound(file, inheritedSound);
                    return;
                }

                loadAsset(file, sounds, failedSounds.current, path =>
                    loadSound(path).then(result => {
                        const loadedSound = result.sound;
                        if (result.success && loadedSound) {
                            registerSound(file, loadedSound);
                        }
                        return result;
                    }),
                );
            }
        });
    }, [assetRefCounts, basePath, camera, models, parentAssetRuntime, registerModel, registerSound, registerTexture, renderer, sounds, textures]);

    const assetRuntime = useMemo<AssetRuntime>(() => ({
        registerObject,
        registerHandle,
        registerModel,
        registerTexture,
        registerSound,
        getHandle,
        getObject,
        getModel,
        getTexture,
        getSound,
        getAssetRevision: () => assetRevision,
    }), [registerObject, registerHandle, registerModel, registerTexture, registerSound, getHandle, getObject, getModel, getTexture, getSound, assetRevision]);

    const handleNodeClick = useCallback((event: ThreeEvent<PointerEvent>, nodeId: string, fallbackObject: Object3D | null) => {
        const node = resolvedStore.getState().nodesById[nodeId];
        if (!node) return;

        const { clickEventName } = analyzeNodeComponents(node);
        emitNodePointerEvent(clickEventName, event, nodeId, node, fallbackObject);
        onClick?.(event, node);
    }, [onClick, resolvedStore]);

    const content = (
        <GameInstanceProvider
            models={models}
            selectedId={selectedId}
            editMode={editMode}
            onSelect={editMode ? onSelect : undefined}
            onClick={editMode ? undefined : handleNodeClick}
            registerRef={registerObject}
        >
            <StoreRootNode
                selectedId={selectedId}
                onSelect={editMode ? onSelect : undefined}
                onClick={editMode ? undefined : handleNodeClick}
                onEditNodeClick={editMode ? onEditNodeClick : undefined}
                registerRef={registerObject}
                loadedModels={models}
                editMode={editMode}
                parentMatrix={IDENTITY}
                basePath={basePath}
            />
            {children}
        </GameInstanceProvider>
    );

    const runtimeContent = parentAssetRuntime ? content : (
        <AssetRuntimeContext.Provider value={assetRuntime}>{content}</AssetRuntimeContext.Provider>
    );

    const sceneContent = parentScene ? runtimeContent : (
        <SceneContext.Provider value={sceneValue}>{runtimeContent}</SceneContext.Provider>
    );

    return <PrefabStoreProvider store={resolvedStore}>{sceneContent}</PrefabStoreProvider>;
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

    const baseTranslation = new Matrix4().makeTranslation(transform.position[0], transform.position[1], transform.position[2]);
    const baseRotation = new Matrix4().makeRotationFromEuler(new Euler(...transform.rotation));
    const baseScale = new Matrix4().makeScale(transform.scale[0], transform.scale[1], transform.scale[2]);
    const offsetMatrix = new Matrix4();
    const worldMatrix = new Matrix4();
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
