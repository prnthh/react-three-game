import { useHelper } from "@react-three/drei";
import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BoxHelper, Euler, Group, Matrix4, Object3D, Quaternion, Texture, Vector3, } from "three";
import { ThreeEvent } from "@react-three/fiber";
import { useStore } from "zustand";
import { useClickValid } from "./useClickValid";

import { GameObject as GameObjectType, Prefab, findComponent } from "./types";
import type { Component } from "./components/ComponentRegistry";
import { getComponentDef, getComponentAssetRefs, registerComponent } from "./components/ComponentRegistry";
import { builtinComponents } from "./components";
import { loadModel, loadSound, loadTexture, LoadedModels, LoadedSounds, LoadedTextures } from "../dragdrop";
import { GameInstance, GameInstanceProvider, getRepeatAxesFromModelProperties, RepeatAxisConfig, useInstanceCheck } from "./InstanceProvider";
import { composeTransform, decompose } from "./utils";
import { isPhysicsProps, PhysicsProps } from "./components/PhysicsComponent";
import { denormalizePrefab } from "./prefab";
import { createPrefabStore, PrefabStoreApi, PrefabStoreProvider, useOptionalPrefabStoreApi, usePrefabChildIds, usePrefabNode, usePrefabRootId } from "./prefabStore";
import { AssetRuntimeContext, EntityRuntimeScope, type AssetRuntimeContextValue } from "./runtimeContext";
import { sound as soundManager } from "../../helpers/SoundManager";

// Dynamic type to avoid requiring @react-three/rapier when not using physics
type RapierRigidBody = any;

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

/** Check if all model assets required by a node are loaded. */
function isNodeReady(node: GameObjectType, loadedModels: LoadedModels): boolean {
    const model = findComponent(node, "Model");
    if (!model?.properties?.filename) return true;
    return Boolean(loadedModels[model.properties.filename]);
}

export interface PrefabRootRef {
    root: Group | null;
    getObject: (nodeId: string) => Object3D | null;
    getRigidBody: (nodeId: string) => any;
    addModel: (path: string, model: Object3D) => void;
    addTexture: (path: string, texture: Texture) => void;
    addSound: (path: string, sound: AudioBuffer) => void;
}

export interface PrefabRootProps {
    editMode?: boolean;
    data?: Prefab;
    store?: PrefabStoreApi;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, entity: GameObjectType) => void;
    onObjectRefChange?: (id: string, object: Object3D | null) => void;
    basePath?: string;
}

export const PrefabRoot = forwardRef<PrefabRootRef, PrefabRootProps>(({ editMode, data, store, selectedId, onSelect, onClick, onObjectRefChange, basePath = "" }, ref) => {

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
    const rigidBodyRefs = useRef<Map<string, RapierRigidBody | null>>(new Map());
    const rootRef = useRef<Group>(null);
    const parentStore = useOptionalPrefabStoreApi();
    const [ownedStore] = useState(() => createPrefabStore(data ?? denormalizePrefab(store?.getState() ?? parentStore?.getState() ?? missingStoreState())));
    const resolvedStore = store ?? parentStore ?? ownedStore;
    const usesOwnedStore = resolvedStore === ownedStore;
    const shouldProvideStoreContext = !parentStore || parentStore !== resolvedStore;
    const assetManifestKey = useStore(resolvedStore, state => state.assetManifestKey);

    const availableModels = useMemo(() => ({ ...models, ...injectedModels }), [models, injectedModels]);
    const availableTextures = useMemo(() => ({ ...textures, ...injectedTextures }), [textures, injectedTextures]);
    const availableSounds = useMemo(() => ({ ...sounds, ...injectedSounds }), [sounds, injectedSounds]);

    const getObject = useCallback((id: string) => {
        return objectRefs.current[id] ?? null;
    }, []);

    useImperativeHandle(ref, () => ({
        root: rootRef.current,
        getObject,
        getRigidBody: (nodeId: string) => rigidBodyRefs.current.get(nodeId) ?? null,
        addModel: (path: string, model: Object3D) => setInjectedModels(prev => ({ ...prev, [path]: model })),
        addTexture: (path: string, texture: Texture) => setInjectedTextures(prev => ({ ...prev, [path]: texture })),
        addSound: (path: string, sound: AudioBuffer) => {
            soundManager.setBuffer(path, sound);
            setInjectedSounds(prev => ({ ...prev, [path]: sound }));
        },
    }), [getObject]);

    const registerRef = useCallback((id: string, obj: Object3D | null) => {
        objectRefs.current[id] = obj;
        onObjectRefChange?.(id, obj);
    }, [onObjectRefChange]);

    const registerRigidBodyRef = useCallback((id: string, rb: any) => {
        rigidBodyRefs.current.set(id, rb);
    }, []);

    const getRigidBody = useCallback((id: string) => {
        return rigidBodyRefs.current.get(id) ?? null;
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
                    if (!result.success) {
                        console.warn(`Failed to load asset: ${file}`, result.error);
                        loading.current.delete(file);
                        failed.add(file);
                    }
                });
            };

            modelsToLoad.forEach(file => loadAsset(
                file, models, injectedModels, failedModels.current,
                (path) => loadModel(path).then(result => {
                    const model = result.model;
                    if (result.success && model) {
                        setModels(m => ({ ...m, [file]: model }));
                    }
                    return result;
                }),
            ));

            texturesToLoad.forEach(file => loadAsset(
                file, textures, injectedTextures, failedTextures.current,
                (path) => loadTexture(path).then(result => {
                    if (result.success && result.texture) {
                        setTextures(t => ({ ...t, [file]: result.texture! }));
                    }
                    return result;
                }),
            ));

            soundsToLoad.forEach(file => loadAsset(
                file, sounds, injectedSounds, failedSounds.current,
                (path) => loadSound(path).then(result => {
                    if (result.success && result.sound) {
                        soundManager.setBuffer(file, result.sound);
                        setSounds(current => ({ ...current, [file]: result.sound! }));
                        loading.current.delete(file);
                    }
                    return result;
                }),
            ));
        };

        syncAssets();
    }, [resolvedStore, assetManifestKey, basePath, injectedModels, injectedSounds, injectedTextures, models, sounds, textures]);

    // Keep refs current so context getters are always fresh without changing context identity
    const availableModelsRef = useRef(availableModels);
    availableModelsRef.current = availableModels;
    const availableTexturesRef = useRef(availableTextures);
    availableTexturesRef.current = availableTextures;
    const availableSoundsRef = useRef(availableSounds);
    availableSoundsRef.current = availableSounds;

    const assetRuntime = useMemo<AssetRuntimeContextValue>(() => ({
        getObject,
        getRigidBody,
        registerRigidBodyRef,
        getModel: (path: string) => availableModelsRef.current[path] ?? null,
        getTexture: (path: string) => availableTexturesRef.current[path] ?? null,
        getSound: (path: string) => availableSoundsRef.current[path] ?? null,
        getAssetRevision: () => {
            const modelKeys = Object.keys(availableModelsRef.current).sort().join('|');
            const textureKeys = Object.keys(availableTexturesRef.current).sort().join('|');
            return `${textureKeys}::${modelKeys}`;
        },
    }), [getObject, getRigidBody, registerRigidBodyRef]);

    const content = (
        <group ref={rootRef}>
            <GameInstanceProvider
                models={availableModels}
                selectedId={selectedId}
                editMode={editMode}
                onSelect={editMode ? onSelect : undefined}
                registerRef={registerRef}
            >
                <StoreRootNode
                    selectedId={selectedId}
                    onSelect={editMode ? onSelect : undefined}
                    onClick={onClick}
                    registerRef={registerRef}
                    loadedModels={availableModels}
                    editMode={editMode}
                    parentMatrix={IDENTITY}
                />
            </GameInstanceProvider>
        </group>
    );

    if (!shouldProvideStoreContext) {
        return <AssetRuntimeContext.Provider value={assetRuntime}>{content}</AssetRuntimeContext.Provider>;
    }

    return <PrefabStoreProvider store={resolvedStore}><AssetRuntimeContext.Provider value={assetRuntime}>{content}</AssetRuntimeContext.Provider></PrefabStoreProvider>;
});

function StoreRootNode(props: Omit<RendererProps, "nodeId">) {
    const rootId = usePrefabRootId();
    return <GameObjectRenderer {...props} nodeId={rootId} />;
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


function InstancedNode({ nodeId, parentMatrix = IDENTITY, editMode, registerRef, onSelect, onClick }: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    if (!gameObject) return null;

    const localTransform = getNodeTransformProps(gameObject);
    const isLocked = Boolean(gameObject.locked);
    const clickComponent = findComponent(gameObject, "Click");
    const clickable = Boolean(clickComponent);
    const clickEventName = clickComponent?.properties?.eventName as string | undefined;

    const physicsData = findComponent(gameObject, "Physics");
    const physicsProps = isPhysicsProps(physicsData?.properties)
        ? physicsData?.properties
        : undefined;
    const modelUrl = findComponent(gameObject, "Model")?.properties?.filename;
    const instances = useMemo(
        () => buildRepeatedInstances(gameObject, parentMatrix, modelUrl, physicsProps),
        [gameObject, modelUrl, parentMatrix, physicsProps]
    );

    const groupRef = useRef<Group>(null);
    const editClickHandlers = useClickValid(!!editMode && !isLocked, (e: any) => {
        onSelect?.(nodeId);
        onClick?.(e, gameObject);
    });

    useEffect(() => {
        if (editMode) {
            registerRef(nodeId, groupRef.current);
            return () => registerRef(nodeId, null);
        }
    }, [nodeId, registerRef, editMode]);

    if (editMode) {
        return (
            <>
                <group
                    ref={groupRef}
                    position={localTransform.position}
                    rotation={localTransform.rotation}
                    scale={localTransform.scale}
                    {...editClickHandlers}
                >
                    <mesh visible={false}>
                        <boxGeometry args={[0.01, 0.01, 0.01]} />
                    </mesh>
                </group>
                {instances.map(instance => (
                    <GameInstance
                        key={instance.id}
                        id={instance.id}
                        sourceId={gameObject.id}
                        clickable={clickable}
                        clickEventName={clickEventName}
                        modelUrl={instance.modelUrl}
                        position={instance.position}
                        rotation={instance.rotation}
                        scale={instance.scale}
                        locked={isLocked}
                        physics={instance.physics}
                    />
                ))}
            </>
        );
    }

    return (
        <>
            {instances.map(instance => (
                <GameInstance
                    key={instance.id}
                    id={instance.id}
                    sourceId={gameObject.id}
                    clickable={clickable}
                    clickEventName={clickEventName}
                    modelUrl={instance.modelUrl}
                    position={instance.position}
                    rotation={instance.rotation}
                    scale={instance.scale}
                    locked={isLocked}
                    physics={instance.physics}
                />
            ))}
        </>
    );
}

function StandardNode({
    nodeId,
    selectedId,
    onSelect,
    onClick,
    registerRef,
    loadedModels,
    editMode,
    parentMatrix = IDENTITY,
}: RendererProps) {
    const gameObject = usePrefabNode(nodeId);
    const childIds = usePrefabChildIds(nodeId);
    const isSelected = selectedId === nodeId;

    if (!gameObject) return null;

    const groupRef = useRef<Object3D | null>(null);
    const helperRef = useRef<Object3D | null>(null);
    const isLocked = Boolean(gameObject.locked);
    const stillInstanced = useInstanceCheck(nodeId);

    const clickHandlers = useClickValid(!!editMode && !isLocked, (e: any) => {
        onSelect?.(nodeId);
        onClick?.(e, gameObject);
    });

    useHelper(
        editMode && isSelected ? helperRef as React.RefObject<Object3D> : null,
        BoxHelper,
        "cyan"
    );

    useEffect(() => {
        registerRef(nodeId, groupRef.current);
        return () => registerRef(nodeId, null);
    }, [nodeId, registerRef]);

    const world = parentMatrix.clone().multiply(compose(gameObject));

    const physics = findComponent(gameObject, "Physics");
    const ready = isNodeReady(gameObject, loadedModels);
    const hasPhysics = physics && ready && !stillInstanced;
    const transform = getNodeTransformProps(gameObject);
    const physicsDef = hasPhysics ? getComponentDef(physics.type) : null;
    const isInstanced = findComponent(gameObject, "Model")?.properties?.instanced;
    const physicsKey = `physics_${nodeId}_${isInstanced ? 'instanced' : 'standard'}`;
    const renderCtx: RenderContext = { loadedModels, editMode, registerRef };
    const childNodes = <ChildNodes childIds={childIds} parentMatrix={world}
        selectedId={selectedId} onSelect={onSelect} onClick={onClick}
        registerRef={registerRef}
        loadedModels={loadedModels} editMode={editMode}
    />;

    const inner = (
        <group
            {...clickHandlers}
        >
            {renderCompositionNode(gameObject, renderCtx, childNodes)}
        </group>
    );
    const physicsInner = editMode ? <group visible={false}>{inner}</group> : inner;

    return (
        <EntityRuntimeScope nodeId={nodeId} editMode={editMode} isSelected={isSelected}>
            {editMode ? (
                <>
                    <group
                        ref={groupRef}
                        position={transform.position}
                        rotation={transform.rotation}
                        scale={transform.scale}
                    >
                        <mesh visible={false}>
                            <boxGeometry args={[0.01, 0.01, 0.01]} />
                        </mesh>
                    </group>
                    <group
                        ref={helperRef}
                        position={transform.position}
                        rotation={transform.rotation}
                        scale={transform.scale}
                    >
                        {inner}
                    </group>
                    {hasPhysics && physicsDef?.View ? (
                        <physicsDef.View
                            key={physicsKey}
                            properties={physics.properties}
                            position={transform.position}
                            rotation={transform.rotation}
                            scale={transform.scale}
                        >{physicsInner}</physicsDef.View>
                    ) : null}
                </>
            ) : hasPhysics && physicsDef?.View ? (
                <physicsDef.View
                    key={physicsKey}
                    properties={physics.properties}
                    position={transform.position}
                    rotation={transform.rotation}
                    scale={transform.scale}
                >{inner}</physicsDef.View>
            ) : (
                <group
                    ref={groupRef}
                    position={transform.position}
                    rotation={transform.rotation}
                    scale={transform.scale}
                >
                    {inner}
                </group>
            )}
        </EntityRuntimeScope>
    );
}

interface RendererProps {
    nodeId: string;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, entity: GameObjectType) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    loadedModels: LoadedModels;
    editMode?: boolean;
    parentMatrix?: Matrix4;
}

type CompositionComponent = {
    key: string;
    View: NonNullable<Component["View"]>;
    properties: any;
    composition: "wrap" | "sibling";
};

interface RenderContext {
    loadedModels: LoadedModels;
    editMode?: boolean;
    registerRef: (id: string, obj: Object3D | null) => void;
}

function isRendererHandledComponent(componentType: string) {
    return componentType === "Transform"
        || componentType === "Geometry"
        || componentType === "Material"
        || componentType === "Physics"
        || componentType === "Model";
}

function getCompositionComponents(gameObject: GameObjectType) {
    return Object.entries(gameObject.components ?? {}).reduce<CompositionComponent[]>((result, [key, comp]) => {
        if (!comp?.type || isRendererHandledComponent(comp.type)) return result;

        const def = getComponentDef(comp.type);
        if (!def?.View) return result;

        result.push({
            key,
            View: def.View,
            properties: comp.properties,
            composition: def.composition ?? "wrap",
        });
        return result;
    }, []);
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
    physics: PhysicsProps | undefined,
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
        physics: PhysicsProps | undefined;
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
                    physics,
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

function renderCompositionNode(
    gameObject: GameObjectType,
    ctx: RenderContext,
    childNodes?: React.ReactNode
) {
    const primaryContent = renderNodePrimaryContent(gameObject, ctx);
    return applyNodeComposition(gameObject, <>{primaryContent}{childNodes}</>);
}

function renderNodePrimaryContent(gameObject: GameObjectType, ctx: RenderContext) {
    const geometry = findComponent(gameObject, "Geometry");
    const material = findComponent(gameObject, "Material");
    const model = findComponent(gameObject, "Model");

    const geometryDef = geometry && getComponentDef(geometry.type);
    const materialDef = material && getComponentDef(material.type);
    const modelDef = model && getComponentDef(model.type);

    if (geometry?.type && geometryDef?.View) {
        return (
            <mesh castShadow receiveShadow>
                <geometryDef.View properties={geometry.properties} />
                {material && materialDef?.View && (
                    <materialDef.View
                        key="material"
                        properties={material.properties}
                    />
                )}
            </mesh>
        );
    }

    if (model?.type && modelDef?.View && !model.properties?.instanced && isNodeReady(gameObject, ctx.loadedModels)) {
        return <modelDef.View properties={model.properties} />;
    }

    return null;
}

function applyNodeComposition(
    gameObject: GameObjectType,
    subtree: React.ReactNode
) {
    const components = getCompositionComponents(gameObject);

    return components.reduce(
        (acc, { key, View, properties, composition }) => composition === "sibling"
            ? (
                <>
                    <View key={key} properties={properties} />
                    {acc}
                </>
            )
            : (
                <View key={key} properties={properties}>
                    {acc}
                </View>
            ),
        subtree
    );
}

export default PrefabRoot;

function missingStoreState(): never {
    throw new Error("PrefabRoot requires either data or store");
}