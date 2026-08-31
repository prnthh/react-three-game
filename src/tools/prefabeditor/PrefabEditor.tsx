import { OrbitControls, TransformControls, useHelper } from "@react-three/drei";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, forwardRef, useImperativeHandle } from "react";
import { BoxHelper, Plane, Vector2, Vector3 } from "three";
import type { Intersection, Object3D, Sprite, Texture } from "three";
import type { RootState } from "@react-three/fiber";
import { findComponentEntry } from "./types";
import type { GameObject, Prefab } from "./types";
import GameCanvas from "../../shared/GameCanvas";
import PrefabRoot from "./PrefabRoot";
import { AssetRuntimeProvider } from "./assetRuntime";
import type { AssetRuntime } from "./assetRuntime";
import { createPrefabRegistry, PrefabEditorMode } from "./SceneContext";
import type { PrefabApi, PrefabNode, Scene } from "./SceneContext";
import { createDefaultMaterial, createImageNode, createModelNode, denormalizePrefab } from "./prefab";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";
import { computeParentWorldMatrix, decompose, exportGLB as exportGLBFile, exportGLBData, focusCameraOnObject, isExternalPath, withBasePath } from "./utils";
import type { ExportGLBOptions } from "./utils";
import { loadDroppedAssets } from "../dragdrop";
import { resolveManifestAssetPath } from "../dragdrop/modelLoader";
import { createPrefabStore, type PrefabStoreState, PrefabStoreProvider } from "./prefabStore";
import type { PrefabState } from "./prefab";
import type { OrbitControls as OrbitControlsImpl, TransformControls as TransformControlsImpl } from 'three-stdlib';
import { decomposeModelToPrefabNodes, hasCollisionMeshConventions } from "./modelPrefab";
import { EditorContext, EditorRefContext, type PrefabEditorRef } from "./EditorContext";

type Vec3 = [number, number, number];
const DROP_POINTER = new Vector2();
const DROP_GROUND = new Plane(new Vector3(0, 1, 0), 0);
const DROP_INTERSECTIONS: Intersection<Object3D>[] = [];
function loadModelManifest(basePath: string) {
    const url = withBasePath(basePath, "/models/manifest.json");
    return fetch(url)
        .then(response => response.ok ? response.json() : [])
        .then(data => Array.isArray(data) ? data.filter((path): path is string => typeof path === 'string') : [])
        .catch(() => []);
}

function raycastDropPosition(event: DragEvent, state: RootState, target: Vector3) {
    const bounds = state.gl.domElement.getBoundingClientRect();
    DROP_POINTER.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    state.raycaster.setFromCamera(DROP_POINTER, state.camera);
    DROP_INTERSECTIONS.length = 0;
    state.raycaster.intersectObject(state.scene, true, DROP_INTERSECTIONS);

    for (let index = 0; index < DROP_INTERSECTIONS.length; index += 1) {
        const intersection = DROP_INTERSECTIONS[index];
        if (hasPrefabNodeAncestor(intersection.object)) {
            target.copy(intersection.point);
            return true;
        }
    }

    return state.raycaster.ray.intersectPlane(DROP_GROUND, target) !== null;
}

function hasPrefabNodeAncestor(object: Object3D) {
    let current: Object3D | null = object;
    while (current) {
        if (typeof current.userData.prefabNodeId === 'string') return true;
        current = current.parent;
    }
    return false;
}

function offsetNodePosition(node: GameObject, offset: Vec3): GameObject {
    const transformEntry = findComponentEntry(node, 'Transform');
    const key = transformEntry?.[0] ?? 'transform';
    const component = transformEntry?.[1] ?? { type: 'Transform', properties: {} };
    const position = component.properties.position ?? [0, 0, 0];
    return {
        ...node,
        components: {
            ...node.components,
            [key]: {
                ...component,
                properties: {
                    ...component.properties,
                    position: [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]],
                },
            },
        },
    };
}

function DropPreview({ previewRef }: { previewRef: React.RefObject<Sprite | null> }) {
    return <sprite ref={previewRef} visible={false} scale={[0.75, 0.75, 0.75]} raycast={() => null}>
        <spriteMaterial color="#48dff2" opacity={0.72} transparent depthTest={false} />
    </sprite>;
}

function isObjectAttachedToRoot(root: Object3D | null | undefined, object: Object3D | null | undefined) {
    if (!root || !object) return false;

    let current: Object3D | null = object;
    while (current) {
        if (current === root) return true;
        current = current.parent;
    }

    return false;
}

export { isExternalPath as isAbsoluteAssetPath } from "./utils";

export function resolvePrefabAssetPath(basePath: string, file: string) {
    return withBasePath(basePath, file);
}

export function getPrefabAssetRef(assetRef: string, folder: "models" | "textures" | "sound") {
    const normalized = assetRef.replace(/^\.\//, '').replace(/^\//, '');
    if (isExternalPath(assetRef) || normalized.startsWith(`${folder}/`)) return assetRef;
    return `${folder}/${assetRef}`;
}

function SelectionHelper({ object }: { object: Object3D | null }) {
    const target = useMemo(() => object ? { current: object } : null, [object]);
    useHelper(target, BoxHelper, "cyan");
    return null;
}

function useRuntimeObject(nodeId: string, prefab: PrefabApi) {
    const subscribe = useCallback(
        (notify: () => void) => prefab.subscribeObject(nodeId, notify),
        [nodeId, prefab],
    );
    const getSnapshot = useCallback(
        () => prefab.getObject(nodeId),
        [nodeId, prefab],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function RegisteredObject({ id, prefab, children }: { id: string; prefab: PrefabApi; children: (object: Object3D) => React.ReactNode }) {
    const object = useRuntimeObject(id, prefab);
    return object ? children(object) : null;
}

export type { EditorContextType, PrefabEditorRef } from "./EditorContext";
export { EditorContext, EditorRefContext, useEditorContext, useEditorRef } from "./EditorContext";

export interface PrefabEditorProps {
    basePath?: string;
    /** Document to edit. Passing a different value reloads the editor. */
    prefab: Prefab;
    /** Editor mode input. Passing a different value updates the editor mode. */
    mode?: PrefabEditorMode;
    onPointerEvent?: React.ComponentProps<typeof PrefabRoot>["onPointerEvent"];
    showUI?: boolean;
    enableWindowDrop?: boolean;
    canvasProps?: Omit<React.ComponentProps<typeof GameCanvas>, 'children'>;
    children?: React.ReactNode;
}

const MAX_HISTORY_LENGTH = 50;

const PrefabEditor = forwardRef<PrefabEditorRef, PrefabEditorProps>(({ basePath = "", prefab, mode: providedMode = PrefabEditorMode.Edit, onPointerEvent, showUI = true, enableWindowDrop = true, canvasProps, children }, ref) => {
    const [mode, setMode] = useState<PrefabEditorMode>(providedMode);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const [scaleSnap, setScaleSnap] = useState(0);
    const [positionSnap, setPositionSnap] = useState(0.5);
    const [rotationSnap, setRotationSnap] = useState(Math.PI / 4);
    const [prefabStore] = useState(() => createPrefabStore(prefab));
    const [prefabRegistry] = useState(createPrefabRegistry);
    const [history, setHistory] = useState<PrefabState[]>(() => [prefabStore.getState()]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const historyIndexRef = useRef(0);
    const providedPrefabRef = useRef(prefab);
    const runtimeRef = useRef<AssetRuntime | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasStateRef = useRef<RootState | null>(null);
    const dropPreviewRef = useRef<Sprite | null>(null);
    const modelManifestRef = useRef<string[]>([]);
    const dropPositionRef = useRef(new Vector3());
    const hasDropPositionRef = useRef(false);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const transformControlsRef = useRef<TransformControlsImpl | null>(null);
    const isEditMode = mode === PrefabEditorMode.Edit;

    useEffect(() => {
        let active = true;
        void loadModelManifest(basePath).then(files => {
            if (active) modelManifestRef.current = files;
        });
        return () => { active = false; };
    }, [basePath]);
    const detachTransformControls = useCallback(() => {
        transformControlsRef.current?.detach();
    }, []);

    const getPrefab = useCallback(() => denormalizePrefab(prefabStore.getState()), [prefabStore]);
    const getNode = useCallback((nodeId: string) => prefabStore.getState().nodesById[nodeId] ?? null, [prefabStore]);
    const getRoot = useCallback(() => prefabRegistry.getObject(prefabStore.getState().rootId), [prefabRegistry, prefabStore]);
    const getObject = prefabRegistry.getObject;
    const getModel = useCallback((path: string) => runtimeRef.current?.getModel(withBasePath(basePath, path)) ?? null, [basePath]);

    // History stores normalized state snapshots. Because store mutations use
    // structural sharing (unchanged nodes keep their references), capturing a
    // snapshot is O(1) instead of deep-cloning the whole prefab tree.
    const recordHistory = useCallback((snapshot: PrefabState) => {
        const currentHistoryIndex = historyIndexRef.current;
        setHistory(prev => {
            const next = [...prev.slice(0, currentHistoryIndex + 1), snapshot];
            return next.length > MAX_HISTORY_LENGTH ? next.slice(1) : next;
        });
        const nextHistoryIndex = Math.min(currentHistoryIndex + 1, MAX_HISTORY_LENGTH - 1);
        historyIndexRef.current = nextHistoryIndex;
        setHistoryIndex(nextHistoryIndex);
    }, []);

    const mutate = useCallback(<R,>(run: (s: PrefabStoreState) => R, pushHistory: boolean = isEditMode): R => {
        const before = prefabStore.getState();
        const result = run(before);
        const after = prefabStore.getState();
        if (after === before) return result;

        if (pushHistory) recordHistory(after);
        return result;
    }, [isEditMode, prefabStore, recordHistory]);

    const update = useCallback((id: string, fn: (node: PrefabNode) => PrefabNode) => {
        mutate(s => s.updateNode(id, fn));
    }, [mutate]);
    const setMaterial = useCallback<PrefabApi["setMaterial"]>((id, material) => {
        mutate(s => s.setMaterial(id, material));
    }, [mutate]);
    const replaceNode = useCallback((id: string, node: GameObject) => {
        mutate(s => s.replaceNode(id, node));
    }, [mutate]);
    const remove = useCallback((id: string) => {
        mutate(s => s.deleteNode(id));
    }, [mutate]);
    const duplicate = useCallback((id: string) => {
        return mutate(s => s.duplicateNode(id));
    }, [mutate]);
    const move = useCallback((draggedId: string, targetId: string, position: "before" | "inside") => {
        mutate(s => s.moveNode(draggedId, targetId, position));
    }, [mutate]);
    const add = useCallback((node: GameObject, parentId?: string) => {
        mutate(s => s.addChild(parentId ?? s.rootId, node));
        return node;
    }, [mutate]);
    const replace = useCallback((prefab: Prefab) => {
        mutate(s => s.replacePrefab(prefab), false);
    }, [mutate]);

    const setSelection = useCallback((nodeId: string | null) => {
        const nextNode = nodeId ? prefabStore.getState().nodesById[nodeId] : null;
        if (nextNode?.locked) {
            return;
        }

        setSelectedId(nodeId);
    }, [prefabStore]);

    const updateMode = useCallback((nextMode: PrefabEditorMode) => {
        setMode(prev => {
            if (prev === nextMode) return prev;
            if (nextMode === PrefabEditorMode.Play) { setSelectedId(null); }
            return nextMode;
        });
    }, []);

    const toggleMode = () => {
        updateMode(isEditMode ? PrefabEditorMode.Play : PrefabEditorMode.Edit);
    };

    const loadPrefab = useCallback((nextPrefab: Prefab) => {
        detachTransformControls();
        prefabStore.getState().replacePrefab(nextPrefab);
        setSelectedId(null);
        setHistory([prefabStore.getState()]);
        historyIndexRef.current = 0;
        setHistoryIndex(0);
    }, [detachTransformControls, prefabStore]);

    useLayoutEffect(() => {
        if (providedPrefabRef.current === prefab) return;
        providedPrefabRef.current = prefab;
        loadPrefab(prefab);
    }, [loadPrefab, prefab]);

    useEffect(() => {
        updateMode(providedMode);
    }, [providedMode, updateMode]);

    useEffect(() => {
        if (!selectedId) return;

        const unsubscribe = prefabStore.subscribe(
            state => Boolean(state.nodesById[selectedId]),
            exists => {
                if (!exists) setSelectedId(null);
            },
        );

        return () => unsubscribe();
    }, [prefabStore, selectedId]);

    const applyHistory = useCallback((index: number) => {
        detachTransformControls();
        prefabStore.getState().restoreState(history[index]);
        historyIndexRef.current = index;
        setHistoryIndex(index);
        setSelectedId(prev => prev && prefabStore.getState().nodesById[prev] ? prev : null);
    }, [detachTransformControls, history, prefabStore]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            applyHistory(historyIndex - 1);
        }
    }, [applyHistory, historyIndex]);
    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            applyHistory(historyIndex + 1);
        }
    }, [applyHistory, history.length, historyIndex]);

    useEffect(() => {
        if (!isEditMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, redo, undo]);

    const handleScreenshot = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${prefabStore.getState().prefabName || 'screenshot'}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }, [prefabStore]);

    const clearSelection = useCallback(async () => {
        setSelection(null);
        await new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    }, [setSelection]);

    const handleExportGLB = useCallback(async (options: ExportGLBOptions = {}) => {
        await clearSelection();

        const rootObject = getRoot();
        if (!rootObject) return;

        return exportGLBFile(rootObject, {
            filename: `${prefabStore.getState().prefabName || 'prefab'}.glb`,
            ...options,
        });
    }, [clearSelection, getRoot, prefabStore]);

    const handleExportGLBData = useCallback(async () => {
        await clearSelection();

        const rootObject = getRoot();
        if (!rootObject) return;

        return exportGLBData(rootObject);
    }, [clearSelection, getRoot]);

    const handleFocusNode = useCallback((nodeId: string) => {
        const object = getObject(nodeId);
        const controls = controlsRef.current;
        const camera = controls?.object;

        if (!object || !controls || !camera) return;

        focusCameraOnObject(object, camera, controls.target, () => controls.update?.());
    }, [getObject]);

    const handleTransformChange = () => {
        if (!selectedId) return;

        const object = getObject(selectedId);
        if (!object) return;

        const parentWorld = computeParentWorldMatrix(prefabStore.getState(), selectedId);
        const local = parentWorld.clone().invert().multiply(object.matrixWorld);
        const { position, rotation, scale } = decompose(local);

        update(selectedId, node => {
            const entry = findComponentEntry(node, "Transform");
            const key = entry?.[0] ?? "transform";
            return {
                ...node,
                components: {
                    ...node.components,
                    [key]: {
                        type: "Transform",
                        properties: { position, rotation, scale },
                    },
                },
            };
        });
    };

    const toRootLocalPosition = useCallback((worldPosition: Vector3): Vec3 => {
        const point = worldPosition.clone();
        const root = getRoot();
        if (root) {
            root.updateWorldMatrix(true, false);
            root.worldToLocal(point);
        }
        return [point.x, point.y, point.z];
    }, [getRoot]);

    const addParsedModel = useCallback((
        model: Object3D,
        filename: string,
        file: File,
        position: Vec3,
        replaceId?: string,
    ) => {
        const runtime = runtimeRef.current;
        const path = getPrefabAssetRef(filename, 'models');
        runtime?.registerModel(withBasePath(basePath, path), model);
        if (!hasCollisionMeshConventions(model)) {
            if (!replaceId) {
                const node = offsetNodePosition(createModelNode(path, file.name.replace(/\.[^.]+$/, '')), position);
                mutate(s => s.addChild(s.rootId, node));
                setSelectedId(node.id);
            }
            return;
        }

        const modelName = file.name.replace(/\.[^.]+$/, '');
        const modelIdPrefix = modelName.replace(/[^\w-]+/g, '-') || 'model';
        const textureRefs = new Map<string, Texture>();
        const decomposed = decomposeModelToPrefabNodes(model, {
            idPrefix: modelIdPrefix,
            getTexturePath: (texture, usage) => {
                const key = `embedded/${modelIdPrefix}/${usage}/${texture.uuid}`;
                textureRefs.set(key, texture);
                return key;
            },
        });
        textureRefs.forEach((texture, texturePath) => {
            runtime?.registerTexture(withBasePath(basePath, texturePath), texture);
        });
        const node = offsetNodePosition({
            ...decomposed.root,
            name: modelName || decomposed.root.name,
        }, position);
        mutate(s => {
            Object.entries(decomposed.materials).forEach(([id, material]) => s.setMaterial(id, material));
            if (replaceId && s.nodesById[replaceId]) s.replaceNode(replaceId, node);
            else s.addChild(s.rootId, node);
        });
        setSelectedId(node.id);
    }, [basePath, mutate]);

    const addImageNode = useCallback((filename: string, file: File, position: Vec3) => {
        const path = getPrefabAssetRef(filename, 'textures');
        const name = file.name.replace(/\.[^.]+$/, '');
        const materialId = `material-${crypto.randomUUID()}`;
        const node = offsetNodePosition(createImageNode(path, materialId, name), position);
        mutate(s => {
            s.setMaterial(materialId, {
                ...createDefaultMaterial(),
                name,
                materialType: 'basic',
                texture: path,
                transparent: true,
            });
            s.addChild(s.rootId, node);
        });
        setSelectedId(node.id);
    }, [mutate]);

    // Dragging only supplies a world position. Asset suspension belongs to the
    // Model component, so dropped and JSON-authored models behave identically.
    useEffect(() => {
        if (!enableWindowDrop || !isEditMode) return;

        function clearDropPreview() {
            hasDropPositionRef.current = false;
            const preview = dropPreviewRef.current;
            if (preview) preview.visible = false;
            canvasStateRef.current?.invalidate();
        }

        function handleDragOver(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();
            const canvasState = canvasStateRef.current;
            if (!canvasState) return;
            const position = dropPositionRef.current;
            if (!raycastDropPosition(e, canvasState, position)) return;
            hasDropPositionRef.current = true;
            const preview = dropPreviewRef.current;
            if (preview) {
                preview.position.copy(position);
                preview.visible = true;
            }
            canvasState.invalidate();
        }

        function handleDrop(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();

            const runtime = runtimeRef.current;
            const canvasState = canvasStateRef.current;
            const worldPosition = dropPositionRef.current;
            if (canvasState) {
                hasDropPositionRef.current = raycastDropPosition(
                    e,
                    canvasState,
                    worldPosition,
                ) || hasDropPositionRef.current;
            }
            if (!runtime || !hasDropPositionRef.current) {
                clearDropPreview();
                return;
            }
            const position = toRootLocalPosition(worldPosition);
            const pendingModels = new Map<File, string>();
            const pendingModelPaths = new Map<File, string>();

            const loading = loadDroppedAssets(e.dataTransfer, {
                onModelLoadStart: (source, filename, file) => {
                    const manifestPath = resolveManifestAssetPath(modelManifestRef.current, filename);
                    const path = manifestPath ?? getPrefabAssetRef(filename, 'models');
                    const node = offsetNodePosition(createModelNode(path, file.name.replace(/\.[^.]+$/, '')), position);
                    pendingModels.set(file, node.id);
                    pendingModelPaths.set(file, path);
                    mutate(s => s.addChild(s.rootId, node));
                    setSelectedId(node.id);
                    void runtime.loadModel(withBasePath(basePath, path), () => source);
                    clearDropPreview();
                },
                onModelLoaded: (model, filename, file) => {
                    const path = pendingModelPaths.get(file) ?? filename;
                    const resolved = runtime.getModel(withBasePath(basePath, path)) ?? model;
                    addParsedModel(resolved, path, file, position, pendingModels.get(file));
                },
                onTextureLoadStart: (source, filename, file) => {
                    const path = getPrefabAssetRef(filename, 'textures');
                    addImageNode(filename, file, position);
                    void runtime.loadTexture(withBasePath(basePath, path), () => source);
                    clearDropPreview();
                },
                onLoadError: error => {
                    console.error('Drop asset error:', error);
                },
            });
            const clearPreview = () => {
                clearDropPreview();
            };
            void loading.then(clearPreview, error => {
                console.error('Drop asset error:', error);
                clearPreview();
            });
        }

        function handleDragLeave(e: DragEvent) {
            if (e.clientX > 0 && e.clientY > 0 && e.clientX < window.innerWidth && e.clientY < window.innerHeight) return;
            clearDropPreview();
        }

        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);
        return () => {
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
            clearDropPreview();
        };
    }, [addImageNode, addParsedModel, basePath, enableWindowDrop, isEditMode, mutate, toRootLocalPosition]);

    const prefabValue = useMemo<PrefabApi>(() => ({
        ...prefabRegistry,
        get root() {
            return getRoot();
        },
        basePath,
        get: getNode,
        getObject,
        getModel,
        getMaterial: (id) => prefabStore.getState().materials[id] ?? null,
        add,
        update,
        setMaterial,
        replaceNode,
        remove,
        duplicate,
        move,
        replace,
        addModel: (path, model) => runtimeRef.current?.registerModel(withBasePath(basePath, path), model),
        addTexture: (path, texture) => runtimeRef.current?.registerTexture(withBasePath(basePath, path), texture),
        addSound: (path, sound) => runtimeRef.current?.registerSound(withBasePath(basePath, path), sound),
    }), [add, basePath, duplicate, getModel, getNode, getObject, getRoot, move, prefabRegistry, prefabStore, remove, replace, replaceNode, setMaterial, update]);
    const sceneValue = useMemo<Scene>(() => ({
        get root() { return prefabValue.root; },
        mode,
    }), [mode, prefabValue]);

    const editorRefValue = useMemo<PrefabEditorRef>(() => ({
        ...prefabValue,
        ...sceneValue,
        save: getPrefab,
        load: loadPrefab,
        undo,
        redo,
        screenshot: handleScreenshot,
        exportGLB: handleExportGLB,
        exportGLBData: handleExportGLBData,
        clearSelection,
    }), [clearSelection, getPrefab, handleExportGLB, handleExportGLBData, handleScreenshot, loadPrefab, prefabValue, redo, sceneValue, undo]);

    useImperativeHandle(ref, () => editorRefValue, [editorRefValue]);

    const handleCanvasCreated = useCallback((state: Parameters<NonNullable<React.ComponentProps<typeof GameCanvas>["onCreated"]>>[0]) => {
        canvasRef.current = state.gl.domElement as HTMLCanvasElement;
        canvasStateRef.current = state;
        canvasProps?.onCreated?.(state);
    }, [canvasProps]);

    return <PrefabStoreProvider store={prefabStore}>
        <AssetRuntimeProvider runtimeRef={runtimeRef}>
            <EditorRefContext.Provider value={editorRefValue}>
                <EditorContext.Provider value={{
                    transformMode,
                    setTransformMode,
                    scaleSnap,
                    setScaleSnap,
                    positionSnap,
                    setPositionSnap,
                    rotationSnap,
                    setRotationSnap,
                    onFocusNode: isEditMode ? handleFocusNode : undefined
                }}>
                    <GameCanvas
                        camera={{ position: [0, 5, 15] }}
                        {...canvasProps}
                        onCreated={handleCanvasCreated}
                        onPointerMissed={isEditMode
                            ? (event) => {
                                const button = event.button ?? (event as MouseEvent & { sourceEvent?: MouseEvent }).sourceEvent?.button ?? 0;
                                if (button === 0 && selectedId) {
                                    setSelection(null);
                                }
                                canvasProps?.onPointerMissed?.(event);
                            }
                            : canvasProps?.onPointerMissed}
                    >
                        {isEditMode ? <gridHelper args={[10, 10]} position={[0, -1, 0]} /> : null}
                        <PrefabRoot
                            store={prefabStore}
                            editMode={isEditMode}
                            selectedId={selectedId}
                            onSelect={setSelection}
                            onPointerEvent={onPointerEvent}
                            basePath={basePath}
                            scene={sceneValue}
                            prefab={prefabValue}
                        >
                            {children}
                        </PrefabRoot>
                        <DropPreview previewRef={dropPreviewRef} />

                        {isEditMode && (
                            <>
                                <OrbitControls ref={controlsRef} enableDamping={false} makeDefault />
                                {selectedId && (
                                    <RegisteredObject id={selectedId} prefab={prefabValue}>
                                        {object => isObjectAttachedToRoot(getRoot(), object) ? (
                                            <>
                                                <SelectionHelper object={object} />
                                                <TransformControls
                                                    ref={transformControlsRef}
                                                    object={object}
                                                    mode={transformMode}
                                                    space={transformMode === "translate" ? "world" : "local"}
                                                    onMouseUp={handleTransformChange}
                                                    translationSnap={positionSnap > 0 ? positionSnap : undefined}
                                                    rotationSnap={rotationSnap > 0 ? rotationSnap : undefined}
                                                    scaleSnap={scaleSnap > 0 ? scaleSnap : undefined}
                                                />
                                            </>
                                        ) : null}
                                    </RegisteredObject>
                                )}
                            </>
                        )}
                    </GameCanvas>

                    {showUI && (
                        <>
                            <div
                                style={{
                                    ...toolbar.panel,
                                    left: "50%",
                                    right: "auto",
                                    transform: "translateX(-50%)",
                                    justifyContent: "center",
                                }}
                            >
                                <button type="button" style={base.btn} onClick={toggleMode}>
                                    {isEditMode ? "▶" : "⏸"}
                                </button>
                            </div>
                            {isEditMode && (
                                <EditorUI
                                    selectedId={selectedId}
                                    setSelectedId={setSelection}
                                    canUndo={historyIndex > 0}
                                    canRedo={historyIndex < history.length - 1}
                                />
                            )}
                        </>
                    )}
                </EditorContext.Provider>
            </EditorRefContext.Provider>
        </AssetRuntimeProvider>
    </PrefabStoreProvider>
});

PrefabEditor.displayName = "PrefabEditor";

export default PrefabEditor;
