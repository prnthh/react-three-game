import { useHelper } from "@react-three/drei";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BoxHelper, Euler, Group, Matrix4, Object3D, Quaternion, Texture, Vector3, } from "three";
import { ThreeEvent } from "@react-three/fiber";

import { Prefab, GameObject as GameObjectType } from "./types";
import { getComponent, registerComponent, getNonComposableKeys } from "./components/ComponentRegistry";
import components from "./components";
import { loadModel, loadTexture } from "../dragdrop";
import { GameInstance, GameInstanceProvider, getRepeatAxesFromModelProperties, RepeatAxisConfig, useInstanceCheck } from "./InstanceProvider";
import { decompose } from "./utils";
import { PhysicsProps } from "./components/PhysicsComponent";

// Dynamic type to avoid requiring @react-three/rapier when not using physics
type RapierRigidBody = any;

components.forEach(registerComponent);

const IDENTITY = new Matrix4();

type ModelRepeatSettings = {
    repeat: boolean;
    repeatAxes: RepeatAxisConfig[];
};

export interface PrefabRootRef {
    root: Group | null;
    rigidBodyRefs: Map<string, any>; // RigidBody refs only populated when using physics
    getObject: (nodeId: string) => Object3D | null;
    focusNode: (nodeId: string) => void;
}

export const PrefabRoot = forwardRef<PrefabRootRef, {
    editMode?: boolean;
    data: Prefab;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, entity: GameObjectType) => void;
    onSelectedObjectChange?: (object: Object3D | null) => void;
    onFocusNode?: (nodeId: string) => void;
    basePath?: string;
    injectedModels?: Record<string, Object3D>;
    injectedTextures?: Record<string, Texture>;
}>(({ editMode, data, selectedId, onSelect, onClick, onSelectedObjectChange, onFocusNode, basePath = "", injectedModels = {}, injectedTextures = {} }, ref) => {

    // prefab root state
    const [models, setModels] = useState<Record<string, Object3D>>({});
    const [textures, setTextures] = useState<Record<string, Texture>>({});
    const loading = useRef(new Set<string>());
    const failedTextures = useRef(new Set<string>());
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const rigidBodyRefs = useRef<Map<string, RapierRigidBody | null>>(new Map());
    const rootRef = useRef<Group>(null);

    const availableModels = useMemo(() => ({ ...models, ...injectedModels }), [models, injectedModels]);
    const availableTextures = useMemo(() => ({ ...textures, ...injectedTextures }), [textures, injectedTextures]);

    useImperativeHandle(ref, () => ({
        root: rootRef.current,
        rigidBodyRefs: rigidBodyRefs.current,
        getObject: (nodeId: string) => objectRefs.current[nodeId] ?? null,
        focusNode: (nodeId: string) => onFocusNode?.(nodeId),
    }), [onFocusNode]);

    const registerRef = useCallback((id: string, obj: Object3D | null) => {
        objectRefs.current[id] = obj;
        if (id === selectedId) {
            onSelectedObjectChange?.(obj);
        }
    }, [onSelectedObjectChange, selectedId]);

    const registerRigidBodyRef = useCallback((id: string, rb: any) => {
        rigidBodyRefs.current.set(id, rb);
    }, []);

    useEffect(() => {
        const originalError = console.error;
        console.error = (...args: any[]) => {
            if (typeof args[0] === 'string' && args[0].includes('TransformControls') && args[0].includes('scene graph')) return;
            originalError.apply(console, args);
        };
        return () => { console.error = originalError; };
    }, []);

    useEffect(() => {
        const modelsToLoad = new Set<string>();
        const texturesToLoad = new Set<string>();

        walk(data.root, node => {
            node.components?.model?.properties?.filename &&
                modelsToLoad.add(node.components.model.properties.filename);
            node.components?.material?.properties?.texture &&
                texturesToLoad.add(node.components.material.properties.texture);
            node.components?.material?.properties?.normalMapTexture &&
                texturesToLoad.add(node.components.material.properties.normalMapTexture);
        });

        modelsToLoad.forEach(async file => {
            if (availableModels[file] || loading.current.has(file)) return;
            loading.current.add(file);
            const path =
                file.startsWith("/")
                    ? `${basePath}${file}`
                    : `${basePath}/${file}`;

            const res = await loadModel(path);
            const model = res.model;

            if (res.success && model) {
                setModels(m => ({ ...m, [file]: model }));
            }
        });

        texturesToLoad.forEach(file => {
            if (availableTextures[file] || loading.current.has(file) || failedTextures.current.has(file)) return;
            loading.current.add(file);

            // Handle full URLs (http/https) or regular paths
            const path = file.startsWith("http://") || file.startsWith("https://")
                ? file
                : file.startsWith("/")
                    ? `${basePath}${file}`
                    : `${basePath}/${file}`;

            void loadTexture(path).then(result => {
                if (result.success && result.texture) {
                    setTextures(t => ({ ...t, [file]: result.texture! }));
                    return;
                }

                console.warn(`Failed to load texture: ${path}`, result.error);
                loading.current.delete(file);
                failedTextures.current.add(file);
            });
        });
    }, [data, availableModels, availableTextures, basePath]);

    return (
        <group ref={rootRef}>
            <GameInstanceProvider
                models={availableModels}
                selectedId={selectedId}
                editMode={editMode}
                onSelect={editMode ? onSelect : undefined}
                registerRef={registerRef}
            >
                <GameObjectRenderer
                    gameObject={data.root}
                    selectedId={selectedId}
                    onSelect={editMode ? onSelect : undefined}
                    onClick={onClick}
                    registerRef={registerRef}
                    registerRigidBodyRef={registerRigidBodyRef}
                    loadedModels={availableModels}
                    loadedTextures={availableTextures}
                    editMode={editMode}
                    parentMatrix={IDENTITY}
                />
            </GameInstanceProvider>
        </group>
    );
});

export function GameObjectRenderer(props: RendererProps) {
    const node = props.gameObject;
    if (!node || node.disabled) return null;

    const isInstanced = node.components?.model?.properties?.instanced;
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

    if (isTransitioning) return null;

    const key = `${node.id}_${isInstanced ? 'instanced' : 'standard'}`;
    return isInstanced
        ? <InstancedNode key={key} {...props} />
        : <StandardNode key={key} {...props} />;
}

function isPhysicsProps(v: any): v is PhysicsProps {
    return v?.type === "fixed" || v?.type === "dynamic" || v?.type === "kinematicPosition" || v?.type === "kinematicVelocity";
}

function InstancedNode({ gameObject, parentMatrix = IDENTITY, editMode, registerRef, selectedId: _selectedId, onSelect, onClick }: RendererProps) {
    const localTransform = getNodeTransformProps(gameObject);
    const isLocked = Boolean(gameObject.locked);
    const clickable = Object.values(gameObject.components ?? {}).some(component => component?.type === 'Click');

    const physicsProps = isPhysicsProps(
        gameObject.components?.physics?.properties
    )
        ? gameObject.components?.physics?.properties
        : undefined;
    const modelUrl = gameObject.components?.model?.properties?.filename;
    const instances = useMemo(
        () => buildRepeatedInstances(gameObject, parentMatrix, modelUrl, physicsProps),
        [gameObject, modelUrl, parentMatrix, physicsProps]
    );

    const groupRef = useRef<Group>(null);
    const clickValid = useRef(false);

    useEffect(() => {
        if (editMode) {
            registerRef(gameObject.id, groupRef.current);
            return () => registerRef(gameObject.id, null);
        }
    }, [gameObject.id, registerRef, editMode]);

    if (editMode) {
        return (
            <>
                <group
                    ref={groupRef}
                    position={localTransform.position}
                    rotation={localTransform.rotation}
                    scale={localTransform.scale}
                    onPointerDown={isLocked ? undefined : (e) => { e.stopPropagation(); clickValid.current = true; }}
                    onPointerMove={isLocked ? undefined : () => { clickValid.current = false; }}
                    onPointerUp={isLocked ? undefined : (e) => {
                        if (clickValid.current) {
                            e.stopPropagation();
                            onSelect?.(gameObject.id);
                            onClick?.(e, gameObject);
                        }
                        clickValid.current = false;
                    }}
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
    gameObject,
    selectedId,
    onSelect,
    onClick,
    registerRef,
    registerRigidBodyRef,
    loadedModels,
    loadedTextures,
    editMode,
    parentMatrix = IDENTITY,
}: RendererProps) {

    const groupRef = useRef<Object3D | null>(null);
    const helperRef = useRef<Object3D | null>(null);
    const clickValid = useRef(false);
    const isLocked = Boolean(gameObject.locked);
    const isSelected = selectedId === gameObject.id;
    const stillInstanced = useInstanceCheck(gameObject.id);

    useHelper(
        editMode && isSelected ? helperRef as React.RefObject<Object3D> : null,
        BoxHelper,
        "cyan"
    );

    useEffect(() => {
        registerRef(gameObject.id, groupRef.current);
        return () => registerRef(gameObject.id, null);
    }, [gameObject.id, registerRef]);

    const world = parentMatrix.clone().multiply(compose(gameObject));

    const onDown = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        clickValid.current = true;
    };

    const onUp = (e: ThreeEvent<PointerEvent>) => {
        if (clickValid.current) {
            e.stopPropagation();
            onSelect?.(gameObject.id);
            onClick?.(e, gameObject);
        }
        clickValid.current = false;
    };

    const physics = gameObject.components?.physics;
    const ready = !gameObject.components?.model ||
        loadedModels[gameObject.components.model.properties.filename];
    const hasPhysics = physics && ready && !stillInstanced;
    const transform = getNodeTransformProps(gameObject);
    const physicsDef = hasPhysics ? getComponent("Physics") : null;
    const isInstanced = gameObject.components?.model?.properties?.instanced;
    const physicsKey = `physics_${gameObject.id}_${isInstanced ? 'instanced' : 'standard'}`;
    const renderCtx = createRenderContext(loadedModels, loadedTextures, editMode, selectedId, registerRef);
    const childNodes = getChildHostComponents(gameObject).length > 0
        ? renderHostedChildren(gameObject, renderCtx, world)
        : renderSceneChildren(gameObject, world, {
            selectedId,
            onSelect,
            onClick,
            registerRef,
            registerRigidBodyRef,
            loadedModels,
            loadedTextures,
            editMode,
        });

    const inner = (
        <group
            onPointerDown={editMode && !isLocked ? onDown : undefined}
            onPointerMove={editMode && !isLocked ? () => (clickValid.current = false) : undefined}
            onPointerUp={editMode && !isLocked ? onUp : undefined}
        >
            {renderCompositionNode(gameObject, renderCtx, parentMatrix, childNodes)}
        </group>
    );

    if (editMode) {
        return (
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
                        editMode={editMode}
                        nodeId={gameObject.id}
                        registerRigidBodyRef={registerRigidBodyRef}
                    >{inner}</physicsDef.View>
                ) : null}
            </>
        );
    }

    if (hasPhysics && physicsDef?.View) {
        return (
            <physicsDef.View
                key={physicsKey}
                properties={physics.properties}
                position={transform.position}
                rotation={transform.rotation}
                scale={transform.scale}
                editMode={editMode}
                nodeId={gameObject.id}
                registerRigidBodyRef={registerRigidBodyRef}
            >{inner}</physicsDef.View>
        );
    }

    return (
        <group
            ref={groupRef}
            position={transform.position}
            rotation={transform.rotation}
            scale={transform.scale}
        >
            {inner}
        </group>
    );
}

interface RendererProps {
    gameObject: GameObjectType;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, entity: GameObjectType) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    registerRigidBodyRef: (id: string, rb: any) => void;
    loadedModels: Record<string, Object3D>;
    loadedTextures: Record<string, Texture>;
    editMode?: boolean;
    parentMatrix?: Matrix4;
}

function getChildHostComponents(gameObject: GameObjectType) {
    return Object.entries(gameObject.components ?? {}).flatMap(([key, comp]) => {
        if (!comp?.type) return [];

        const def = getComponent(comp.type);
        if (!def?.View || def.nonComposable) return [];

        return { key, View: def.View, properties: comp.properties };
    });
}

interface RenderContext {
    loadedModels: Record<string, Object3D>;
    loadedTextures: Record<string, Texture>;
    editMode?: boolean;
    selectedId?: string | null;
    registerRef: (id: string, obj: Object3D | null) => void;
}

interface RuntimeChildRendererProps {
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, entity: GameObjectType) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    registerRigidBodyRef: (id: string, rb: any) => void;
    loadedModels: Record<string, Object3D>;
    loadedTextures: Record<string, Texture>;
    editMode?: boolean;
}

function createRenderContext(
    loadedModels: Record<string, Object3D>,
    loadedTextures: Record<string, Texture>,
    editMode: boolean | undefined,
    selectedId: string | null | undefined,
    registerRef: (id: string, obj: Object3D | null) => void,
): RenderContext {
    return { loadedModels, loadedTextures, editMode, selectedId, registerRef };
}

function renderSceneChildren(
    gameObject: GameObjectType,
    parentMatrix: Matrix4,
    props: RuntimeChildRendererProps,
) {
    return gameObject.children?.map(child =>
        <GameObjectRenderer
            key={child.id}
            gameObject={child}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
            onClick={props.onClick}
            registerRef={props.registerRef}
            registerRigidBodyRef={props.registerRigidBodyRef}
            loadedModels={props.loadedModels}
            loadedTextures={props.loadedTextures}
            editMode={props.editMode}
            parentMatrix={parentMatrix}
        />
    );
}

function walk(node: GameObjectType, fn: (n: GameObjectType) => void) {
    fn(node);
    node.children?.forEach(c => walk(c, fn));
}

function compose(node?: GameObjectType | null) {
    const { position, rotation, scale } = getNodeTransformProps(node);
    return new Matrix4().compose(
        new Vector3(...position),
        new Quaternion().setFromEuler(new Euler(...rotation)),
        new Vector3(...scale)
    );
}

function getModelRepeatSettings(node?: GameObjectType | null): ModelRepeatSettings {
    const properties = node?.components?.model?.properties ?? {};
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
    const t = node?.components?.transform?.properties;
    return {
        position: t?.position ?? [0, 0, 0],
        rotation: t?.rotation ?? [0, 0, 0],
        scale: t?.scale ?? [1, 1, 1],
    };
}

function renderCompositionSubtree(
    gameObject: GameObjectType,
    ctx: RenderContext,
    parentMatrix = IDENTITY
): React.ReactNode {
    if (!gameObject || gameObject.disabled) return null;

    const transform = getNodeTransformProps(gameObject);
    const world = parentMatrix.clone().multiply(compose(gameObject));
    const childNodes = renderHostedChildren(gameObject, ctx, world);

    return (
        <group
            key={gameObject.id}
            position={transform.position}
            rotation={transform.rotation}
            scale={transform.scale}
        >
            {renderCompositionNode(gameObject, ctx, parentMatrix, childNodes)}
        </group>
    );
}

function renderHostedChildren(
    gameObject: GameObjectType,
    ctx: RenderContext,
    parentMatrix: Matrix4,
) {
    return gameObject.children?.map(child =>
        renderCompositionSubtree(child, ctx, parentMatrix)
    );
}

function renderCompositionNode(
    gameObject: GameObjectType,
    ctx: RenderContext,
    parentMatrix?: Matrix4,
    childNodes?: React.ReactNode
) {
    const ownContent = renderNodeOwnContent(gameObject, ctx, parentMatrix);
    return wrapWithChildHosts(gameObject, ctx, parentMatrix, <>{ownContent}{childNodes}</>);
}

function renderNodeOwnContent(
    gameObject: GameObjectType,
    ctx: RenderContext,
    parentMatrix?: Matrix4
) {
    const geometry = gameObject.components?.geometry;
    const material = gameObject.components?.material;
    const model = gameObject.components?.model;
    const text = gameObject.components?.text;

    const geometryDef = geometry && getComponent("Geometry");
    const materialDef = material && getComponent("Material");
    const modelDef = model && getComponent("Model");
    const textDef = text && getComponent("Text");

    const contextProps = {
        loadedModels: ctx.loadedModels,
        loadedTextures: ctx.loadedTextures,
        editMode: ctx.editMode,
        isSelected: ctx.selectedId === gameObject.id,
        nodeId: gameObject.id,
        parentMatrix,
        registerRef: ctx.registerRef,
    };

    let core: React.ReactNode;

    if (model && modelDef?.View) {
        core = (
            <modelDef.View properties={model.properties} {...contextProps}>
                {material && materialDef?.View && (
                    <materialDef.View
                        key="material"
                        properties={material.properties}
                        {...contextProps}
                    />
                )}
            </modelDef.View>
        );
    } else if (geometry && geometryDef?.View) {
        core = (
            <mesh castShadow receiveShadow>
                <geometryDef.View properties={geometry.properties} {...contextProps} />
                {material && materialDef?.View && (
                    <materialDef.View
                        key="material"
                        properties={material.properties}
                        {...contextProps}
                    />
                )}
            </mesh>
        );
    } else if (text && textDef?.View) {
        core = (
            <>
                <textDef.View properties={text.properties} {...contextProps} />
            </>
        );
    } else {
        core = null;
    }

    return core;
}

function wrapWithChildHosts(
    gameObject: GameObjectType,
    ctx: RenderContext,
    parentMatrix: Matrix4 | undefined,
    subtree: React.ReactNode
) {
    const contextProps = {
        loadedModels: ctx.loadedModels,
        loadedTextures: ctx.loadedTextures,
        editMode: ctx.editMode,
        isSelected: ctx.selectedId === gameObject.id,
        nodeId: gameObject.id,
        parentMatrix,
        registerRef: ctx.registerRef,
    };

    const childHosts = getChildHostComponents(gameObject);

    return childHosts.reduce(
        (acc, { key, View, properties }) => (
            <View key={key} properties={properties} {...contextProps}>
                {acc}
            </View>
        ),
        subtree
    );
}

export default PrefabRoot;