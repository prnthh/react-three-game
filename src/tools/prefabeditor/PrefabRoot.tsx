import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Euler, Group, Matrix4, Object3D, Quaternion, Texture, Vector3, } from "three";
import { ThreeEvent } from "@react-three/fiber";
import { useStore } from "zustand";
import { useClickValid } from "./useClickValid";

import { ComponentData, GameObject as GameObjectType, Prefab, findComponent, getNodeUserData } from "./types";
import type { Component } from "./components/ComponentRegistry";
import { getComponentDef, getComponentAssetRefs, registerComponent } from "./components/ComponentRegistry";
import { builtinComponents } from "./components";
import { loadModel, loadSound, loadTexture, LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { GameInstance, GameInstanceProvider, getRepeatAxesFromModelProperties, RepeatAxisConfig, useInstanceCheck } from "./InstanceProvider";
import { composeTransform, decompose } from "./utils";
import { createPrefabStore, PrefabStoreApi, PrefabStoreProvider, usePrefabChildIds, usePrefabNode, usePrefabRootId } from "./prefabStore";
import { AssetRuntimeContext, NodeScope, type AssetRuntime } from "./assetRuntime";
import { gameEvents } from "./GameEvents";
import { sound as soundManager } from "../../helpers/SoundManager";

builtinComponents.forEach(registerComponent);

const IDENTITY = new Matrix4();
const EMPTY_MODELS: LoadedModels = {};
const EMPTY_TEXTURES: LoadedTextures = {};
const EMPTY_SOUNDS: LoadedSounds = {};

/** Resolve a relative or absolute asset file path against a base path. */
function resolveAssetPath(basePath: string, file: string): string {
    if (file.startsWith("http://") || file.startsWith("https://")) return file;
    return file.startsWith("/") ? `${basePath}${file}` : `${basePath}/${file}`;
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

export enum PrefabEditorMode {
    Edit = "edit",
    Play = "play",
}

export type PrefabNode = Omit<GameObjectType, "children">;

export interface Scene {
    // Reads
    root: Object3D | null;
    mode: PrefabEditorMode;
    get(id: string): GameObjectType | null;
    getObject(id: string): Object3D | null;
    getHandle<T = unknown>(id: string, kind: string): T | null;
    // Mutations
    add(node: GameObjectType, parentId?: string): GameObjectType;
    update(id: string, fn: (node: PrefabNode) => PrefabNode): void;
    remove(id: string): void;
    duplicate(id: string): string | null;
    move(draggedId: string, targetId: string, position: "before" | "inside"): void;
    replace(prefab: Prefab): void;
    // Asset injection (for runtime-loaded assets)
    addModel(path: string, model: Object3D): void;
    addTexture(path: string, texture: Texture): void;
    addSound(path: string, sound: AudioBuffer): void;
}

export const SceneContext = createContext<Scene | null>(null);

export function useScene() {
    const scene = useContext(SceneContext);
    if (!scene) {
        throw new Error("useScene must be used within a PrefabRoot or PrefabEditor scene provider");
    }
    return scene;
}

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
    material: ComponentData | undefined;
    model: ComponentData | undefined;
    sprite: ComponentData | undefined;
    clickEventName: string | null;
    composition: CompositionComponent[];
};

export const PrefabRoot = forwardRef<Scene, PrefabRootProps>(({ editMode, data, store, selectedId, onSelect, onClick, onEditNodeClick, basePath = "", children }, ref) => {

    const [models, setModels] = useState<LoadedModels>({});
    const [textures, setTextures] = useState<LoadedTextures>({});
    const [sounds, setSounds] = useState<LoadedSounds>({});
    const [injectedModels, setInjectedModels] = useState<LoadedModels>(EMPTY_MODELS);
    const [injectedTextures, setInjectedTextures] = useState<LoadedTextures>(EMPTY_TEXTURES);
    const [injectedSounds, setInjectedSounds] = useState<LoadedSounds>(EMPTY_SOUNDS);
    const loading = useRef(new Set<string>());
    const failedModels = useRef(new Set<string>());
    const failedTextures = useRef(new Set<string>());
    const failedSounds = useRef(new Set<string>());
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const nodeHandles = useRef<Map<string, Map<string, unknown>>>(new Map());
    const [ownedStore] = useState<PrefabStoreApi | null>(() => {
        if (store) return null;
        if (data) return createPrefabStore(data);
        throw new Error("PrefabRoot requires either a `data` or `store` prop");
    });
    const resolvedStore = store ?? ownedStore!;
    const usesOwnedStore = resolvedStore === ownedStore;
    const rootId = useStore(resolvedStore, state => state.rootId);
    const assetManifestKey = useStore(resolvedStore, state => state.assetManifestKey);

    const availableModels = useMemo(() => ({ ...models, ...injectedModels }), [models, injectedModels]);
    const availableTextures = useMemo(() => ({ ...textures, ...injectedTextures }), [textures, injectedTextures]);
    const availableSounds = useMemo(() => ({ ...sounds, ...injectedSounds }), [sounds, injectedSounds]);

    const getObject = useCallback((id: string) => {
        return objectRefs.current[id] ?? null;
    }, []);

    const getHandle = useCallback(<T = unknown,>(id: string, kind: string) => {
        return (nodeHandles.current.get(id)?.get(kind) as T | undefined) ?? null;
    }, []);

    const getNode = useCallback((nodeId: string) => {
        return resolvedStore.getState().nodesById[nodeId] ?? null;
    }, [resolvedStore]);

    const registerHandle = useCallback((id: string, kind: string, handle: unknown) => {
        const current = nodeHandles.current.get(id);

        if (handle == null) {
            if (!current) return;
            current.delete(kind);
            if (current.size === 0) {
                nodeHandles.current.delete(id);
            }
            return;
        }

        if (current) {
            current.set(kind, handle);
            return;
        }

        nodeHandles.current.set(id, new Map([[kind, handle]]));
    }, []);

    const sceneValue = useMemo<Scene>(() => ({
        get root() {
            return objectRefs.current[rootId] ?? null;
        },
        mode: editMode ? PrefabEditorMode.Edit : PrefabEditorMode.Play,
        get: getNode,
        getObject,
        getHandle,
        add: (node, parentId) => {
            const state = resolvedStore.getState();
            state.addChild(parentId ?? state.rootId, node);
            return node;
        },
        update: (id, fn) => resolvedStore.getState().updateNode(id, fn),
        remove: (id) => resolvedStore.getState().deleteNode(id),
        duplicate: (id) => resolvedStore.getState().duplicateNode(id),
        move: (draggedId, targetId, position) => resolvedStore.getState().moveNode(draggedId, targetId, position),
        replace: (prefab) => resolvedStore.getState().replacePrefab(prefab),
        addModel: (path, model) => setInjectedModels(prev => ({ ...prev, [path]: model })),
        addTexture: (path, texture) => setInjectedTextures(prev => ({ ...prev, [path]: texture })),
        addSound: (path, sound) => {
            soundManager.setBuffer(path, sound);
            setInjectedSounds(prev => ({ ...prev, [path]: sound }));
        },
    }), [editMode, getHandle, getNode, getObject, resolvedStore, rootId]);

    useImperativeHandle(ref, () => sceneValue, [sceneValue]);

    const registerRef = useCallback((id: string, obj: Object3D | null) => {
        objectRefs.current[id] = obj;
    }, []);

    useEffect(() => {
        if (usesOwnedStore && data) {
            resolvedStore.getState().replacePrefab(data);
        }
    }, [data, resolvedStore, usesOwnedStore]);

    useEffect(() => {
        const syncAssets = (snapshot = resolvedStore.getState()) => {
            const modelsToLoad = new Set<string>();
            const texturesToLoad = new Set<string>();
            const soundsToLoad = new Set<string>();

            Object.values(snapshot.nodesById).forEach(node => {
                Object.values(node.components ?? {}).forEach(component => {
                    if (!component?.type) return;

                    for (const ref of getComponentAssetRefs(component.type, component.properties ?? {})) {
                        if (ref.type === 'model') modelsToLoad.add(ref.path);
                        else if (ref.type === 'texture') texturesToLoad.add(ref.path);
                        else if (ref.type === 'sound') soundsToLoad.add(ref.path);
                    }
                });
            });

            const loadAsset = <T,>(
                file: string,
                loaded: Record<string, T>,
                injected: Record<string, T>,
                failed: Set<string>,
                loader: (path: string) => Promise<{ success: boolean; error?: unknown }>,
            ) => {
                if (loaded[file] || injected[file] || loading.current.has(file) || failed.has(file)) return;
                loading.current.add(file);
                void loader(resolveAssetPath(basePath, file)).then(result => {
                    loading.current.delete(file);
                    if (!result.success) {
                        console.warn(`Failed to load asset: ${file}`, result.error);
                        failed.add(file);
                    }
                });
            };

            modelsToLoad.forEach(file => loadAsset(file, models, injectedModels, failedModels.current, path =>
                loadModel(path).then(result => {
                    if (result.success && result.model) setModels(m => ({ ...m, [file]: result.model! }));
                    return result;
                }),
            ));

            texturesToLoad.forEach(file => loadAsset(file, textures, injectedTextures, failedTextures.current, path =>
                loadTexture(path).then(result => {
                    if (result.success && result.texture) setTextures(t => ({ ...t, [file]: result.texture! }));
                    return result;
                }),
            ));

            soundsToLoad.forEach(file => loadAsset(file, sounds, injectedSounds, failedSounds.current, path =>
                loadSound(path).then(result => {
                    if (result.success && result.sound) {
                        soundManager.setBuffer(file, result.sound);
                        setSounds(s => ({ ...s, [file]: result.sound! }));
                    }
                    return result;
                }),
            ));
        };

        syncAssets();
    }, [resolvedStore, assetManifestKey, basePath, injectedModels, injectedSounds, injectedTextures, models, sounds, textures]);

    const assetRuntime = useMemo<AssetRuntime>(() => ({
        registerHandle,
        getHandle,
        getObject,
        getModel: (path: string) => availableModels[path] ?? null,
        getTexture: (path: string) => availableTextures[path] ?? null,
        getSound: (path: string) => availableSounds[path] ?? null,
        getAssetRevision: () => `${Object.keys(availableTextures).sort().join('|')}::${Object.keys(availableModels).sort().join('|')}`,
    }), [registerHandle, getHandle, getObject, availableModels, availableTextures, availableSounds]);

    const handleNodeClick = useCallback((event: ThreeEvent<PointerEvent>, nodeId: string, fallbackObject: Object3D | null) => {
        const node = resolvedStore.getState().nodesById[nodeId];
        if (!node) return;

        const { clickEventName } = analyzeNodeComponents(node);
        emitNodePointerEvent(clickEventName, event, nodeId, node, fallbackObject);
        onClick?.(event, node);
    }, [onClick, resolvedStore]);

    const content = (
        <GameInstanceProvider
            models={availableModels}
            selectedId={selectedId}
            editMode={editMode}
            onSelect={editMode ? onSelect : undefined}
            onClick={editMode ? undefined : handleNodeClick}
            registerRef={registerRef}
        >
            <StoreRootNode
                selectedId={selectedId}
                onSelect={editMode ? onSelect : undefined}
                onClick={editMode ? undefined : handleNodeClick}
                onEditNodeClick={editMode ? onEditNodeClick : undefined}
                registerRef={registerRef}
                loadedModels={availableModels}
                editMode={editMode}
                parentMatrix={IDENTITY}
            />
            {children}
        </GameInstanceProvider>
    );

    const runtimeContent = (
        <SceneContext.Provider value={sceneValue}>
            <AssetRuntimeContext.Provider value={assetRuntime}>{content}</AssetRuntimeContext.Provider>
        </SceneContext.Provider>
    );

    return <PrefabStoreProvider store={resolvedStore}>{runtimeContent}</PrefabStoreProvider>;
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
    let material: ComponentData | undefined;
    let model: ComponentData | undefined;
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
                material = component;
                break;
            case "Model":
                model = component;
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
        material,
        model,
        sprite,
        clickEventName: getClickEventName(bufferGeometry) ?? getClickEventName(geometry) ?? getClickEventName(model) ?? getClickEventName(sprite),
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
    const trimmedEventName = eventName?.trim();
    if (!trimmedEventName) return;

    gameEvents.emit(trimmedEventName, {
        sourceEntityId: nodeId,
        sourceNodeId: nodeId,
        nodeId,
        node,
        object: event.object ?? fallbackObject,
        point: [event.point.x, event.point.y, event.point.z],
        button: event.button,
        altKey: event.nativeEvent.altKey,
        ctrlKey: event.nativeEvent.ctrlKey,
        metaKey: event.nativeEvent.metaKey,
        shiftKey: event.nativeEvent.shiftKey,
        r3fEvent: event,
    });
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
    if (!gameObject) return null;

    const analyzedComponents = useMemo(() => analyzeNodeComponents(gameObject), [gameObject]);
    const localTransform = getNodeTransformProps(gameObject);
    const isLocked = Boolean(gameObject.locked);
    const nodeVisible = isVisible && !gameObject.hidden;
    const metadataProps = getNodeMetadataProps(gameObject);
    const groupProps = {
        ...metadataProps,
        visible: nodeVisible,
        position: localTransform.position,
        rotation: localTransform.rotation,
        scale: localTransform.scale,
    };

    const modelUrl = analyzedComponents.model?.properties?.filename;
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
        onSelect?.(nodeId);
        onEditNodeClick?.(event, gameObject);
    });

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
}: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    const childIds = usePrefabChildIds(nodeId);
    if (!gameObject) return null;

    const analyzedComponents = useMemo(() => analyzeNodeComponents(gameObject), [gameObject]);
    const isSelected = selectedId === nodeId;
    const isLocked = Boolean(gameObject.locked);
    const nodeVisible = isVisible && !gameObject.hidden;
    const stillInstanced = useInstanceCheck(nodeId);
    const metadataProps = getNodeMetadataProps(gameObject);

    const groupRef = useRef<Object3D | null>(null);
    const handleGroupRef = useCallback((object: Object3D | null) => {
        groupRef.current = object;
        registerRef(nodeId, object);
    }, [nodeId, registerRef]);

    const editClickHandlers = useClickValid(!!editMode && !isLocked, (event: ThreeEvent<PointerEvent>) => {
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

    const ready = isNodeReady(analyzedComponents.model, loadedModels);
    const transform = getNodeTransformProps(gameObject);
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
        selectedId={selectedId} onSelect={onSelect} onClick={onClick} onEditNodeClick={onEditNodeClick}
        registerRef={registerRef}
        loadedModels={loadedModels} editMode={editMode}
        isVisible={nodeVisible}
    />;

    const inner = renderNodeContent(analyzedComponents, loadedModels, primaryClickHandlers, childNodes);
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
}

type PrimaryClickHandlers = { onClick?: (event: ThreeEvent<PointerEvent>) => void };

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
    gameObject: GameObjectType,
    parentMatrix: Matrix4,
    modelUrl: string | undefined,
) {
    if (!modelUrl) return [];

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
    childNodes?: React.ReactNode
) {
    const geometry = analyzedComponents.geometry;
    const model = analyzedComponents.model;
    const material = analyzedComponents.material;
    const sprite = analyzedComponents.sprite;
    const shapeKind = sprite?.type ? 'sprite' : geometry?.type ? 'mesh' : model?.type ? 'model' : 'none';
    let materialContent: React.ReactNode = null;

    switch (shapeKind) {
        case 'sprite': {
            const materialDef = material?.type ? getComponentDef(material.type) : undefined;
            if (material?.properties && materialDef?.View) {
                const materialIsSprite = material.properties.materialType === 'sprite';
                materialContent = (
                    <materialDef.View
                        key="material"
                        properties={{
                            ...material.properties,
                            materialType: 'sprite',
                            transparent: materialIsSprite ? material.properties.transparent : true,
                            depthTest: materialIsSprite ? material.properties.depthTest : false,
                            depthWrite: materialIsSprite ? material.properties.depthWrite : false,
                        }}
                    />
                );
            }
            break;
        }
        case 'mesh': {
            const materialDef = material?.type ? getComponentDef(material.type) : undefined;
            if (material?.properties && materialDef?.View) {
                materialContent = <materialDef.View key="material" properties={material.properties} />;
            }
            break;
        }
    }

    let primaryContent: React.ReactNode = null;
    let contentChildren = childNodes;

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
            if (!model?.type || model.properties?.instanced || !isNodeReady(model, loadedModels)) break;

            const modelDef = getComponentDef(model.type);
            if (!modelDef?.View) break;

            const modelContent = <modelDef.View properties={model.properties} />;
            primaryContent = primaryClickHandlers ? <group {...primaryClickHandlers}>{modelContent}</group> : modelContent;
            break;
        }
    }

    let content = <>{primaryContent}{contentChildren}</>;
    for (const { key, View, properties } of analyzedComponents.composition) {
        content = (
            <View key={key} properties={properties}>
                {content}
            </View>
        );
    }

    return content;
}

export default PrefabRoot;