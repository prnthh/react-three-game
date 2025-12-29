"use client";

import { MapControls, TransformControls, useHelper } from "@react-three/drei";
import { forwardRef, useCallback, useEffect, useRef, useState, } from "react";
import { BoxHelper, Euler, Group, Matrix4, Object3D, Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3, } from "three";
import { ThreeEvent } from "@react-three/fiber";

import { Prefab, GameObject as GameObjectType } from "./types";
import { getComponent, registerComponent } from "./components/ComponentRegistry";
import components from "./components";
import { loadModel } from "../dragdrop/modelLoader";
import { GameInstance, GameInstanceProvider } from "./InstanceProvider";
import { updateNode } from "./utils";
import { PhysicsProps } from "./components/PhysicsComponent";

/* -------------------------------------------------- */
/* Setup */
/* -------------------------------------------------- */

components.forEach(registerComponent);

const IDENTITY = new Matrix4();

/* -------------------------------------------------- */
/* PrefabRoot */
/* -------------------------------------------------- */

export const PrefabRoot = forwardRef<Group, {
    editMode?: boolean;
    data: Prefab;
    onPrefabChange?: (data: Prefab) => void;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    transformMode?: "translate" | "rotate" | "scale";
    basePath?: string;
}>(({ editMode, data, onPrefabChange, selectedId, onSelect, transformMode, basePath = "" }, ref) => {

    const [models, setModels] = useState<Record<string, Object3D>>({});
    const [textures, setTextures] = useState<Record<string, Texture>>({});
    const loading = useRef(new Set<string>());
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);

    const registerRef = useCallback((id: string, obj: Object3D | null) => {
        objectRefs.current[id] = obj;
        if (id === selectedId) setSelectedObject(obj);
    }, [selectedId]);

    useEffect(() => {
        setSelectedObject(selectedId ? objectRefs.current[selectedId] ?? null : null);
    }, [selectedId]);

    /* ---------------- Transform writeback ---------------- */

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

    /* ---------------- Asset loading ---------------- */

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

    /* ---------------- Render ---------------- */

    return (
        <group ref={ref}>
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
                            object={selectedObject}
                            mode={transformMode}
                            space="local"
                            onObjectChange={onTransformChange}
                        />
                    )}
                </>
            )}
        </group>
    );
});

/* -------------------------------------------------- */
/* Renderer Switch */
/* -------------------------------------------------- */

export function GameObjectRenderer(props: RendererProps) {
    const node = props.gameObject;
    if (!node || node.hidden || node.disabled) return null;
    return node.components?.model?.properties?.instanced
        ? <InstancedNode {...props} />
        : <StandardNode {...props} />;
}

/* -------------------------------------------------- */
/* InstancedNode (terminal) */
/* -------------------------------------------------- */
function isPhysicsProps(v: any): v is PhysicsProps {
    return v?.type === "fixed" || v?.type === "dynamic";
}

function InstancedNode({ gameObject, parentMatrix = IDENTITY, editMode }: RendererProps) {
    const world = parentMatrix.clone().multiply(compose(gameObject));
    const { position, rotation, scale } = decompose(world);
    const physicsProps = isPhysicsProps(
        gameObject.components?.physics?.properties
    )
        ? gameObject.components?.physics?.properties
        : undefined;

    return (
        <GameInstance
            id={gameObject.id}
            modelUrl={gameObject.components?.model?.properties?.filename}
            position={position}
            rotation={rotation}
            scale={scale}
            physics={editMode ? undefined : physicsProps}
        />
    );
}

/* -------------------------------------------------- */
/* StandardNode */
/* -------------------------------------------------- */

function StandardNode({
    gameObject,
    selectedId,
    onSelect,
    registerRef,
    loadedModels,
    loadedTextures,
    editMode,
    parentMatrix = IDENTITY,
}: RendererProps) {

    const groupRef = useRef<Object3D | null>(null);
    const clickValid = useRef(false);
    const isSelected = selectedId === gameObject.id;
    const helperRef = groupRef as React.RefObject<Object3D>;

    useHelper(
        editMode && isSelected ? helperRef : null,
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
        }
        clickValid.current = false;
    };

    const inner = (
        <group
            ref={groupRef}
            {...getNodeTransformProps(gameObject)}
            onPointerDown={onDown}
            onPointerMove={() => (clickValid.current = false)}
            onPointerUp={onUp}
        >
            {renderCoreNode(gameObject, { loadedModels, loadedTextures, editMode, registerRef }, parentMatrix)}
            {gameObject.children?.map(child => (
                <GameObjectRenderer
                    key={child.id}
                    {...{ child }}
                    gameObject={child}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    registerRef={registerRef}
                    loadedModels={loadedModels}
                    loadedTextures={loadedTextures}
                    editMode={editMode}
                    parentMatrix={world}
                />
            ))}
        </group>
    );

    const physics = gameObject.components?.physics;
    const ready = !gameObject.components?.model ||
        loadedModels[gameObject.components.model.properties.filename];

    if (physics && !editMode && ready) {
        const def = getComponent("Physics");
        return def?.View
            ? <def.View properties={physics.properties}>{inner}</def.View>
            : inner;
    }

    return inner;
}

/* -------------------------------------------------- */
/* Types & Helpers */
/* -------------------------------------------------- */

interface RendererProps {
    gameObject: GameObjectType; // ← no longer optional
    selectedId?: string | null;
    onSelect?: (id: string) => void;
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

    const geometryDef = geometry && getComponent("Geometry");
    const materialDef = material && getComponent("Material");
    const modelDef = model && getComponent("Model");

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
            .filter(([k]) => !["geometry", "material", "model", "transform", "physics"].includes(k))
            .forEach(([key, comp]) => {
                if (!comp?.type) return;
                const def = getComponent(comp.type);
                if (!def?.View) return;

                // crude but works with your existing component API
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