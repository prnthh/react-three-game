import { OrbitControls, TransformControls, useHelper } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, forwardRef, useImperativeHandle } from "react";
import { BoxHelper } from "three";
import type { Object3D, Texture } from "three";
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
import { createPrefabStore, type PrefabStoreState, PrefabStoreProvider } from "./prefabStore";
import type { PrefabState } from "./prefab";
import type { OrbitControls as OrbitControlsImpl, TransformControls as TransformControlsImpl } from 'three-stdlib';
import { decomposeModelToPrefabNodes, hasCollisionMeshConventions } from "./modelPrefab";
import { EditorContext, EditorRefContext, type PrefabEditorRef } from "./EditorContext";

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
    return isExternalPath(assetRef) ? assetRef : `${folder}/${assetRef}`;
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
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const transformControlsRef = useRef<TransformControlsImpl | null>(null);
    const isEditMode = mode === PrefabEditorMode.Edit;
    const detachTransformControls = useCallback(() => {
        transformControlsRef.current?.detach();
    }, []);

    const getPrefab = useCallback(() => denormalizePrefab(prefabStore.getState()), [prefabStore]);
    const getNode = useCallback((nodeId: string) => prefabStore.getState().nodesById[nodeId] ?? null, [prefabStore]);
    const getRoot = useCallback(() => prefabRegistry.getObject(prefabStore.getState().rootId), [prefabRegistry, prefabStore]);
    const getObject = prefabRegistry.getObject;
    const getHandle = prefabRegistry.getHandle;
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

    useEffect(() => {
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

    const selectedIsInstanced = Boolean(
        selectedId && findComponentEntry(getNode(selectedId), "Model")?.[1].properties?.instanced,
    );

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

    // --- Drag & drop files to add nodes ---
    useEffect(() => {
        if (!enableWindowDrop || !isEditMode) return;

        function handleDragOver(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();
        }

        function handleDrop(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();

            const runtime = runtimeRef.current;

            void loadDroppedAssets(e.dataTransfer, {
                onModelLoaded: (model, filename, file) => {
                    const path = getPrefabAssetRef(filename, 'models');
                    runtime?.registerModel(withBasePath(basePath, path), model);
                    const modelName = file.name.replace(/\.[^.]+$/, '');
                    const modelIdPrefix = modelName.replace(/[^\w-]+/g, '-') || 'model';

                    if (hasCollisionMeshConventions(model)) {
                        const textureRefs = new Map<string, Texture>();
                        const decomposed = decomposeModelToPrefabNodes(model, {
                            idPrefix: modelIdPrefix,
                            getTexturePath: (texture, usage) => {
                                const key = `embedded/${modelIdPrefix}/${usage}/${texture.uuid}`;
                                textureRefs.set(key, texture);
                                return key;
                            },
                        });
                        textureRefs.forEach((texture, path) => { runtime?.registerTexture(withBasePath(basePath, path), texture); });
                        Object.entries(decomposed.materials).forEach(([id, material]) => setMaterial(id, material));
                        add({
                            ...decomposed.root,
                            name: modelName || decomposed.root.name,
                        });
                        return;
                    }

                    add(createModelNode(path, modelName));
                },
                onTextureLoaded: (texture, filename, file) => {
                    const path = getPrefabAssetRef(filename, 'textures');
                    runtime?.registerTexture(withBasePath(basePath, path), texture);
                    const name = file.name.replace(/\.[^.]+$/, '');
                    const materialId = `material-${crypto.randomUUID()}`;
                    setMaterial(materialId, {
                        ...createDefaultMaterial(),
                        name,
                        materialType: 'basic',
                        texture: path,
                        transparent: true,
                    });
                    add(createImageNode(path, materialId, name));
                },
                onLoadError: error => {
                    console.error('Drop asset error:', error);
                },
            });
        }

        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);
        return () => {
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, [add, basePath, isEditMode, enableWindowDrop, setMaterial]);

    const prefabValue = useMemo<PrefabApi>(() => ({
        ...prefabRegistry,
        get root() {
            return getRoot();
        },
        basePath,
        get: getNode,
        getObject,
        getHandle,
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
    }), [add, basePath, duplicate, getHandle, getModel, getNode, getObject, getRoot, move, prefabRegistry, prefabStore, remove, replace, replaceNode, setMaterial, update]);
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
                                                    onObjectChange={selectedIsInstanced ? handleTransformChange : undefined}
                                                    onMouseUp={selectedIsInstanced ? undefined : handleTransformChange}
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
