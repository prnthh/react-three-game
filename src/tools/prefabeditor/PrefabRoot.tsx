"use client";

import { MapControls, TransformControls } from "@react-three/drei";
import { useState, useRef, useEffect, forwardRef, useMemo, useCallback } from "react";
import { Vector3, Euler, Quaternion, ClampToEdgeWrapping, DoubleSide, Group, Object3D, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, Matrix4 } from "three";
import { Prefab, GameObject as GameObjectType } from "./types";
import { getComponent } from "./components/ComponentRegistry";
import { ThreeEvent } from "@react-three/fiber";
import { loadModel } from "../dragdrop/modelLoader";
import { GameInstance, GameInstanceProvider } from "./InstanceProvider";

// register all components
import { registerComponent } from './components/ComponentRegistry';
import components from './components/';
components.forEach(registerComponent);

function updatePrefabNode(root: GameObjectType, id: string, update: (node: GameObjectType) => GameObjectType): GameObjectType {
    if (root.id === id) {
        return update(root);
    }
    if (root.children) {
        return {
            ...root,
            children: root.children.map(child => updatePrefabNode(child, id, update))
        };
    }
    return root;
}

export const PrefabRoot = forwardRef<Group, {
    editMode?: boolean;
    data: Prefab;
    onPrefabChange?: (data: Prefab) => void;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    transformMode?: "translate" | "rotate" | "scale";
    setTransformMode?: (mode: "translate" | "rotate" | "scale") => void;
    basePath?: string;
}>(({ editMode, data, onPrefabChange, selectedId, onSelect, transformMode, setTransformMode, basePath = "" }, ref) => {
    const [loadedModels, setLoadedModels] = useState<Record<string, Object3D>>({});
    const [loadedTextures, setLoadedTextures] = useState<Record<string, Texture>>({});
    // const [prefabRoot, setPrefabRoot] = useState<Prefab>(data); // Removed local state
    const loadingRefs = useRef<Set<string>>(new Set());
    const objectRefs = useRef<Record<string, Object3D | null>>({});
    const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);

    const registerRef = useCallback((id: string, obj: Object3D | null) => {
        objectRefs.current[id] = obj;
        if (id === selectedId) {
            setSelectedObject(obj);
        }
    }, [selectedId]);

    useEffect(() => {
        if (selectedId) {
            setSelectedObject(objectRefs.current[selectedId] || null);
        } else {
            setSelectedObject(null);
        }
    }, [selectedId]);

    const onTransformChange = () => {
        if (!selectedId || !onPrefabChange) return;
        const obj = objectRefs.current[selectedId];
        if (!obj) return;

        // 1. Get world matrix from the actual Three object
        const worldMatrix = obj.matrixWorld.clone();

        // 2. Compute parent world matrix from the prefab tree
        const parentWorld = computeParentWorldMatrix(data.root, selectedId);
        const parentInv = parentWorld.clone().invert();

        // 3. Convert world -> local
        const localMatrix = new Matrix4().multiplyMatrices(parentInv, worldMatrix);

        const lp = new Vector3();
        const lq = new Quaternion();
        const ls = new Vector3();
        localMatrix.decompose(lp, lq, ls);

        const le = new Euler().setFromQuaternion(lq);

        // 4. Write back LOCAL transform into the prefab node
        const newRoot = updatePrefabNode(data.root, selectedId, (node) => ({
            ...node,
            components: {
                ...node?.components,
                transform: {
                    type: "Transform",
                    properties: {
                        position: [lp.x, lp.y, lp.z] as [number, number, number],
                        rotation: [le.x, le.y, le.z] as [number, number, number],
                        scale: [ls.x, ls.y, ls.z] as [number, number, number],
                    },
                },
            },
        }));

        onPrefabChange({ ...data, root: newRoot });
    };


    useEffect(() => {
        const loadAssets = async () => {
            const modelsToLoad = new Set<string>();
            const texturesToLoad = new Set<string>();

            const traverse = (node?: GameObjectType | null) => {
                if (!node) return;
                if (node.components?.model?.properties?.filename) {
                    modelsToLoad.add(node.components.model.properties.filename);
                }
                if (node.components?.material?.properties?.texture) {
                    texturesToLoad.add(node.components.material.properties.texture);
                }
                node.children?.forEach(traverse);
            };
            traverse(data.root);

            for (const filename of modelsToLoad) {
                if (!loadedModels[filename] && !loadingRefs.current.has(filename)) {
                    loadingRefs.current.add(filename);
                    // Load model directly from public root, prepend "/" if not present
                    const modelPath = filename.startsWith('/') ? filename : `/${filename}`;
                    const result = await loadModel(modelPath);
                    if (result.success && result.model) {
                        setLoadedModels(prev => ({ ...prev, [filename]: result.model }));
                    }
                }
            }

            const textureLoader = new TextureLoader();
            for (const filename of texturesToLoad) {
                if (!loadedTextures[filename] && !loadingRefs.current.has(filename)) {
                    loadingRefs.current.add(filename);
                    // Load texture directly from public root, prepend "/" if not present
                    const texturePath = filename.startsWith('/') ? filename : `/${filename}`;
                    textureLoader.load(texturePath, (texture) => {
                        texture.colorSpace = SRGBColorSpace;
                        setLoadedTextures(prev => ({ ...prev, [filename]: texture }));
                    });
                }
            }
        };
        loadAssets();
    }, [data, loadedModels, loadedTextures]);



    return <group ref={ref}>
        <GameInstanceProvider models={loadedModels} onSelect={editMode ? onSelect : undefined} registerRef={registerRef}>
            <GameObjectRenderer
                gameObject={data.root}
                selectedId={selectedId}
                onSelect={editMode ? onSelect : undefined}
                registerRef={registerRef}
                loadedModels={loadedModels}
                loadedTextures={loadedTextures}
                editMode={editMode}
                parentMatrix={new Matrix4()}
            />
        </GameInstanceProvider>


        {editMode && <>
            <MapControls makeDefault />

            {selectedId && selectedObject && (
                <TransformControls
                    object={selectedObject}
                    mode={transformMode}
                    space="local"
                    onObjectChange={onTransformChange}
                />
            )}
        </>}
    </group>;
});

interface GameObjectRendererProps {
    gameObject?: GameObjectType | null;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    registerRef: (id: string, obj: Object3D | null) => void;
    loadedModels: Record<string, Object3D>;
    loadedTextures: Record<string, Texture>;
    editMode?: boolean;
    parentMatrix?: Matrix4;          // 👈 new
}


function GameObjectRenderer({
    gameObject,
    selectedId,
    onSelect,
    registerRef,
    loadedModels,
    loadedTextures,
    editMode,
    parentMatrix = new Matrix4(),
}: GameObjectRendererProps) {

    // Early return if gameObject is null or undefined
    if (!gameObject) return null;
    if (gameObject.disabled === true || gameObject.hidden === true) return null;

    // Build context object for passing to helper functions
    const ctx = { gameObject, selectedId, onSelect, registerRef, loadedModels, loadedTextures, editMode };

    // --- 1. Compute transforms (local + world) ---
    const transformProps = getNodeTransformProps(gameObject);
    const localMatrix = new Matrix4().compose(
        new Vector3(...transformProps.position),
        new Quaternion().setFromEuler(new Euler(...transformProps.rotation)),
        new Vector3(...transformProps.scale)
    );
    const worldMatrix = parentMatrix.clone().multiply(localMatrix);

    // --- 2. Handle selection interaction (edit mode only) ---
    const clickValid = useRef(false);
    const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        clickValid.current = true;
    };
    const handlePointerMove = () => {
        if (clickValid.current) clickValid.current = false;
    };
    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (clickValid.current) {
            e.stopPropagation();
            onSelect?.(gameObject.id);
        }
        clickValid.current = false;
    };

    // --- 3. If instanced model, short-circuit to GameInstance (terminal node) ---
    const isInstanced = !!gameObject.components?.model?.properties?.instanced;
    if (isInstanced) {
        return renderInstancedNode(gameObject, worldMatrix, ctx);
    }

    // --- 4. Render core content using component system ---
    const core = renderCoreNode(gameObject, ctx, parentMatrix);

    // --- 5. Wrap with physics if needed (except in edit mode) ---
    const physicsWrapped = wrapPhysicsIfNeeded(gameObject, core, ctx);

    // --- 6. Render children recursively (always relative transforms) ---
    const children = (gameObject.children ?? []).map((child) => (
        <GameObjectRenderer
            key={child.id}
            gameObject={child}
            selectedId={selectedId}
            onSelect={onSelect}
            registerRef={registerRef}
            loadedModels={loadedModels}
            loadedTextures={loadedTextures}
            editMode={editMode}
            parentMatrix={worldMatrix}
        />
    ));

    // --- 7. Final group wrapper with local transform ---
    return (
        <group
            ref={(el) => registerRef(gameObject.id, el)}
            position={transformProps.position}
            rotation={transformProps.rotation}
            scale={transformProps.scale}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {physicsWrapped}
            {children}
        </group>
    );
}

// Helper: render an instanced GameInstance (terminal node)
function renderInstancedNode(gameObject: GameObjectType, worldMatrix: Matrix4, ctx: any) {
    const physics = gameObject.components?.physics;
    const wp = new Vector3();
    const wq = new Quaternion();
    const ws = new Vector3();
    worldMatrix.decompose(wp, wq, ws);
    const we = new Euler().setFromQuaternion(wq);
    const modelUrl = gameObject.components?.model?.properties?.filename;
    return (
        <GameInstance
            id={gameObject.id}
            modelUrl={modelUrl}
            position={[wp.x, wp.y, wp.z]}
            rotation={[we.x, we.y, we.z]}
            scale={[ws.x, ws.y, ws.z]}
            physics={ctx.editMode ? undefined : (physics?.properties as any)}
        />
    );
}

// Helper: render main content for a non-instanced node using the component system
function renderCoreNode(gameObject: GameObjectType, ctx: any, parentMatrix: Matrix4 | undefined) {
    const geometry = gameObject.components?.geometry;
    const material = gameObject.components?.material;
    const model = gameObject.components?.model;

    const geometryDef = geometry ? getComponent('Geometry') : undefined;
    const materialDef = material ? getComponent('Material') : undefined;
    const modelDef = model ? getComponent('Model') : undefined;

    // Context props for all component Views
    const contextProps = {
        loadedModels: ctx.loadedModels,
        loadedTextures: ctx.loadedTextures,
        isSelected: ctx.selectedId === gameObject.id,
        editMode: ctx.editMode,
        parentMatrix,
        registerRef: ctx.registerRef,
    };

    // Collect wrapper and leaf components (excluding transform/physics which are handled separately)
    const wrapperComponents: Array<{ key: string; View: any; properties: any }> = [];
    const leafComponents: React.ReactNode[] = [];

    if (gameObject.components) {
        Object.entries(gameObject.components)
            .filter(([key]) => !['geometry', 'material', 'model', 'transform', 'physics'].includes(key))
            .forEach(([key, comp]) => {
                if (!comp || !comp.type) return;
                const def = getComponent(comp.type);
                if (!def || !def.View) return;

                // Components that accept children are wrappers, others are leaves
                const viewString = def.View.toString();
                if (viewString.includes('children')) {
                    wrapperComponents.push({ key, View: def.View, properties: comp.properties });
                } else {
                    leafComponents.push(<def.View key={key} properties={comp.properties} {...contextProps} />);
                }
            });
    }

    // Build core content based on what components exist
    let coreContent: React.ReactNode;

    // Priority: Model > Geometry + Material > Empty
    if (model && modelDef && modelDef.View) {
        // Model component wraps its children (including material override)
        coreContent = (
            <modelDef.View properties={model.properties} {...contextProps}>
                {material && materialDef && materialDef.View && (
                    <materialDef.View
                        key="material"
                        properties={material.properties}
                        {...contextProps}
                    />
                )}
                {leafComponents}
            </modelDef.View>
        );
    } else if (geometry && geometryDef && geometryDef.View) {
        // Geometry + Material = mesh
        coreContent = (
            <mesh castShadow receiveShadow>
                <geometryDef.View properties={geometry.properties} {...contextProps} />
                {material && materialDef && materialDef.View && (
                    <materialDef.View
                        key="material"
                        properties={material.properties}
                        {...contextProps}
                    />
                )}
                {leafComponents}
            </mesh>
        );
    } else {
        // No visual component - just render leaves
        coreContent = <>{leafComponents}</>;
    }

    // Wrap core content with wrapper components (in order)
    return wrapperComponents.reduce((content, { key, View, properties }) => {
        return <View key={key} properties={properties} {...contextProps}>{content}</View>;
    }, coreContent);
}

// Helper: wrap core content with physics component when necessary
function wrapPhysicsIfNeeded(gameObject: GameObjectType, content: React.ReactNode, ctx: any) {
    const physics = gameObject.components?.physics;
    if (!physics) return content;
    const physicsDef = getComponent('Physics');
    if (!physicsDef || !physicsDef.View) return content;
    return (
        <physicsDef.View
            properties={{ ...physics.properties, id: gameObject.id }}
            editMode={ctx.editMode}
        >
            {content}
        </physicsDef.View>
    );
}





export default PrefabRoot;

function getNodeTransformProps(node?: GameObjectType | null) {
    const t = node?.components?.transform?.properties;
    return {
        position: t?.position ?? [0, 0, 0],
        rotation: t?.rotation ?? [0, 0, 0],
        scale: t?.scale ?? [1, 1, 1],
    };
}

function computeParentWorldMatrix(root: GameObjectType, targetId: string): Matrix4 {
    const identity = new Matrix4();

    function traverse(node: GameObjectType, parentWorld: Matrix4): Matrix4 | null {
        if (node.id === targetId) {
            // parentWorld is what we want
            return parentWorld.clone();
        }

        const { position, rotation, scale } = getNodeTransformProps(node);

        const localPos = new Vector3(...position);
        const localRot = new Euler(...rotation);
        const localScale = new Vector3(...scale);

        const localMat = new Matrix4().compose(
            localPos,
            new Quaternion().setFromEuler(localRot),
            localScale
        );

        const worldMat = parentWorld.clone().multiply(localMat);

        if (node.children) {
            for (const child of node.children) {
                const res = traverse(child, worldMat);
                if (res) return res;
            }
        }

        return null;
    }

    return traverse(root, identity) ?? identity;
}
