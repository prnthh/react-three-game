import { MapControls, TransformControls, useHelper } from "@react-three/drei";
import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BoxHelper, Euler, Group, Matrix4, Object3D, Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3, } from "three";
import { ThreeEvent } from "@react-three/fiber";

import { Prefab, GameObject as GameObjectType } from "./types";
import { getComponent, registerComponent, getNonComposableKeys } from "./components/ComponentRegistry";
import components from "./components";
import { loadModel } from "../dragdrop/modelLoader";
import { GameInstance, GameInstanceProvider, useInstanceCheck } from "./InstanceProvider";
import { updateNode } from "./utils";
import { PhysicsProps } from "./components/PhysicsComponent";
import { EditorContext } from "./EditorContext";

components.forEach(registerComponent);

const IDENTITY = new Matrix4();

export interface PrefabRootRef {
    root: Group | null;
}

export const PrefabRoot = forwardRef<PrefabRootRef, {
    editMode?: boolean;
    data: Prefab;
    onPrefabChange?: (data: Prefab) => void;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, entity: GameObjectType) => void;
    basePath?: string;
}>(({ editMode, data, onPrefabChange, selectedId, onSelect, onClick, basePath = "" }, ref) => {

    // optional editor context
    const editorContext = useContext(EditorContext);
    const transformMode = editorContext?.transformMode ?? "translate";
    const snapResolution = editorContext?.snapResolution ?? 0;

    // prefab root state
    const [models, setModels] = useState<Record<string, Object3D>>({});
    const [textures, setTextures] = useState<Record<string, Texture>>({});
    const loading = useRef(new Set<string>());
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);
    const rootRef = useRef<Group>(null);

    useImperativeHandle(ref, () => ({
        root: rootRef.current
    }), []);

    const registerRef = useCallback((id: string, obj: Object3D | null) => {
        objectRefs.current[id] = obj;
        if (id === selectedId) setSelectedObject(obj);
    }, [selectedId]);

    useEffect(() => {
        const originalError = console.error;
        console.error = (...args: any[]) => {
            if (typeof args[0] === 'string' && args[0].includes('TransformControls') && args[0].includes('scene graph')) return;
            originalError.apply(console, args);
        };
        return () => { console.error = originalError; };
    }, []);

    useEffect(() => {
        setSelectedObject(selectedId ? objectRefs.current[selectedId] ?? null : null);
    }, [selectedId]);

    const onTransformChange = () => {
        if (!selectedId || !onPrefabChange) return;

        const obj = objectRefs.current[selectedId];
        if (!obj) return;

        const parentWorld = computeParentWorldMatrix(data.root, selectedId);
        const local = parentWorld.clone().invert().multiply(obj.matrixWorld);

        const { position, rotation, scale } = decompose(local);

        const root = updateNode(data.root, selectedId, node => ({
            ...node,
            components: {
                ...node.components,
                transform: {
                    type: "Transform",
                    properties: { position, rotation, scale },
                },
            },
        }));

        onPrefabChange({ ...data, root });
    };

    useEffect(() => {
        const modelsToLoad = new Set<string>();
        const texturesToLoad = new Set<string>();

        walk(data.root, node => {
            node.components?.model?.properties?.filename &&
                modelsToLoad.add(node.components.model.properties.filename);
            node.components?.material?.properties?.texture &&
                texturesToLoad.add(node.components.material.properties.texture);
        });

        modelsToLoad.forEach(async file => {
            if (models[file] || loading.current.has(file)) return;
            loading.current.add(file);
            const path =
                file.startsWith("/")
                    ? `${basePath}${file}`
                    : `${basePath}/${file}`;

            const res = await loadModel(path);
            res.success && res.model &&
                setModels(m => ({ ...m, [file]: res.model }));
        });

        const loader = new TextureLoader();
        texturesToLoad.forEach(file => {
            if (textures[file] || loading.current.has(file)) return;
            loading.current.add(file);
            const path =
                file.startsWith("/")
                    ? `${basePath}${file}`
                    : `${basePath}/${file}`;

            loader.load(path, tex => {
                tex.colorSpace = SRGBColorSpace;
                setTextures(t => ({ ...t, [file]: tex }));
            });
        });
    }, [data, models, textures]);

    return (
        <group ref={rootRef}>
            <GameInstanceProvider
                models={models}
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
                    loadedModels={models}
                    loadedTextures={textures}
                    editMode={editMode}
                    parentMatrix={IDENTITY}
                />
            </GameInstanceProvider>

            {editMode && (
                <>
                    <MapControls makeDefault />
                    {selectedObject && (
                        <TransformControls
                            key={`transform-${snapResolution}`}
                            object={selectedObject}
                            mode={transformMode}
                            space="local"
                            onObjectChange={onTransformChange}
                            translationSnap={snapResolution > 0 ? snapResolution : undefined}
                            rotationSnap={snapResolution > 0 ? snapResolution : undefined}
                            scaleSnap={snapResolution > 0 ? snapResolution : undefined}
                        />
                    )}
                </>
            )}
        </group>
    );
});

export function GameObjectRenderer(props: RendererProps) {
    const node = props.gameObject;
    if (!node || node.hidden || node.disabled) return null;

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
    return v?.type === "fixed" || v?.type === "dynamic";
}

function InstancedNode({ gameObject, parentMatrix = IDENTITY, editMode, registerRef, selectedId: _selectedId, onSelect, onClick }: RendererProps) {
    const world = parentMatrix.clone().multiply(compose(gameObject));
    const { position: worldPosition, rotation: worldRotation, scale: worldScale } = decompose(world);
    const localTransform = getNodeTransformProps(gameObject);

    const physicsProps = isPhysicsProps(
        gameObject.components?.physics?.properties
    )
        ? gameObject.components?.physics?.properties
        : undefined;

    const groupRef = useRef<Group>(null);
    const clickValid = useRef(false);

    useEffect(() => {
        if (editMode) {
            registerRef(gameObject.id, groupRef.current);
            return () => registerRef(gameObject.id, null);
        }
    }, [gameObject.id, registerRef, editMode]);

    const modelUrl = gameObject.components?.model?.properties?.filename;

    if (editMode) {
        return (
            <>
                <group
                    ref={groupRef}
                    position={localTransform.position}
                    rotation={localTransform.rotation}
                    scale={localTransform.scale}
                    onPointerDown={(e) => { e.stopPropagation(); clickValid.current = true; }}
                    onPointerMove={() => { clickValid.current = false; }}
                    onPointerUp={(e) => {
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
                <GameInstance
                    id={gameObject.id}
                    modelUrl={modelUrl}
                    position={worldPosition}
                    rotation={worldRotation}
                    scale={worldScale}
                    physics={physicsProps}
                />
            </>
        );
    }

    return (
        <GameInstance
            id={gameObject.id}
            modelUrl={gameObject.components?.model?.properties?.filename}
            position={worldPosition}
            rotation={worldRotation}
            scale={worldScale}
            physics={physicsProps}
        />
    );
}

function StandardNode({
    gameObject,
    selectedId,
    onSelect,
    onClick,
    registerRef,
    loadedModels,
    loadedTextures,
    editMode,
    parentMatrix = IDENTITY,
}: RendererProps) {

    const groupRef = useRef<Object3D | null>(null);
    const helperRef = useRef<Object3D | null>(null);
    const clickValid = useRef(false);
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

    const inner = (
        <group
            onPointerDown={editMode ? onDown : undefined}
            onPointerMove={editMode ? () => (clickValid.current = false) : undefined}
            onPointerUp={editMode ? onUp : undefined}
        >
            {renderCoreNode(gameObject, { loadedModels, loadedTextures, editMode, registerRef }, parentMatrix)}
            {gameObject.children?.map(child => (
                <GameObjectRenderer
                    key={child.id}
                    gameObject={child}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onClick={onClick}
                    registerRef={registerRef}
                    loadedModels={loadedModels}
                    loadedTextures={loadedTextures}
                    editMode={editMode}
                    parentMatrix={world}
                />
            ))}
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
            >{inner}</physicsDef.View>
        );
    }

    return (
        <group
            ref={groupRef}
            position={transform.position}
            rotation={transform.rotation}
            scale={transform.scale}
            onPointerDown={onDown}
            onPointerMove={() => (clickValid.current = false)}
            onPointerUp={onUp}
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
    loadedModels: Record<string, Object3D>;
    loadedTextures: Record<string, Texture>;
    editMode?: boolean;
    parentMatrix?: Matrix4;
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

function decompose(m: Matrix4) {
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    m.decompose(p, q, s);
    const e = new Euler().setFromQuaternion(q);
    return {
        position: [p.x, p.y, p.z] as [number, number, number],
        rotation: [e.x, e.y, e.z] as [number, number, number],
        scale: [s.x, s.y, s.z] as [number, number, number],
    };
}

function getNodeTransformProps(node?: GameObjectType | null) {
    const t = node?.components?.transform?.properties;
    return {
        position: t?.position ?? [0, 0, 0],
        rotation: t?.rotation ?? [0, 0, 0],
        scale: t?.scale ?? [1, 1, 1],
    };
}

function computeParentWorldMatrix(root: GameObjectType, targetId: string): Matrix4 {
    let result: Matrix4 | null = null;

    const visit = (node: GameObjectType, parent: Matrix4) => {
        if (node.id === targetId) {
            result = parent.clone();
            return;
        }
        const world = parent.clone().multiply(compose(node));
        node.children?.forEach(c => !result && visit(c, world));
    };

    visit(root, IDENTITY);
    return result ?? IDENTITY;
}

function renderCoreNode(
    gameObject: GameObjectType,
    ctx: {
        loadedModels: Record<string, Object3D>;
        loadedTextures: Record<string, Texture>;
        editMode?: boolean;
        registerRef: (id: string, obj: Object3D | null) => void;
    },
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
        parentMatrix,
        registerRef: ctx.registerRef,
    };

    const wrappers: Array<{ key: string; View: any; properties: any }> = [];
    const leaves: React.ReactNode[] = [];

    if (gameObject.components) {
        Object.entries(gameObject.components)
            .filter(([k]) => !getNonComposableKeys().includes(k))
            .forEach(([key, comp]) => {
                if (!comp?.type) return;
                const def = getComponent(comp.type);
                if (!def?.View) return;

                if (def.View.toString().includes("children")) {
                    wrappers.push({ key, View: def.View, properties: comp.properties });
                } else {
                    leaves.push(
                        <def.View key={key} properties={comp.properties} {...contextProps} />
                    );
                }
            });
    }

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
                {leaves}
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
                {leaves}
            </mesh>
        );
    } else if (text && textDef?.View) {
        core = (
            <>
                <textDef.View properties={text.properties} {...contextProps} />
                {leaves}
            </>
        );
    } else {
        core = <>{leaves}</>;
    }

    return wrappers.reduce(
        (acc, { key, View, properties }) => (
            <View key={key} properties={properties} {...contextProps}>
                {acc}
            </View>
        ),
        core
    );
}

export default PrefabRoot;