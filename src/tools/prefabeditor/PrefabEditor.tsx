import { MapControls, TransformControls } from "@react-three/drei";
import GameCanvas from "../../shared/GameCanvas";
import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Object3D, Texture } from "three";
import { LoadedModels, LoadedTextures } from "../dragdrop";
import { GameObject, Prefab } from "./types";
import PrefabRoot, { PrefabRootRef } from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";
import { EditorContext } from "./EditorContext";
import { createImageNode, createModelNode, computeParentWorldMatrix, decompose, exportGLB as exportGLBFile, exportGLBData, focusCameraOnObject, regenerateIds } from "./utils";
import type { ExportGLBOptions } from "./utils";
import { loadFiles } from "../dragdrop";
import { createPrefabStore, PrefabStoreProvider, prefabStoreToPrefab } from "./prefabStore";
import { createScene, type Scene, type SpawnOptions } from "./sceneApi";

export interface PrefabEditorRef {
    screenshot: () => void;
    exportGLB: (options?: ExportGLBOptions) => Promise<ArrayBuffer | undefined>;
    exportGLBData: () => Promise<ArrayBuffer | undefined>;
    clearSelection: () => Promise<void>;
    save: () => Prefab;
    scene: Scene;
    load: (prefab: Prefab, options?: { resetHistory?: boolean; notifyChange?: boolean }) => void;
    addModel: (path: string, model: Object3D, options?: SpawnOptions) => GameObject;
    addTexture: (path: string, texture: Texture, options?: SpawnOptions) => GameObject;
    viewRef: React.RefObject<PrefabRootRef | null>;
}

export interface PrefabEditorProps {
    basePath?: string;
    initialPrefab?: Prefab;
    physics?: boolean;
    onChange?: (prefab: Prefab) => void;
    showUI?: boolean;
    enableWindowDrop?: boolean;
    canvasProps?: Omit<React.ComponentProps<typeof GameCanvas>, 'children' | 'canvasRef'>;
    uiPlugins?: React.ReactNode[] | React.ReactNode;
    children?: React.ReactNode;
}

const DEFAULT_PREFAB: Prefab = {
    id: "prefab-default",
    name: "New Prefab",
    root: {
        id: "root",
        components: {
            transform: {
                type: "Transform",
                properties: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
            }
        }
    }
};

const PrefabEditor = forwardRef<PrefabEditorRef, PrefabEditorProps>(({ basePath, initialPrefab, physics = true, onChange, showUI = true, enableWindowDrop = true, canvasProps, uiPlugins, children }, ref) => {
    const [editMode, setEditMode] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const [scaleSnap, setScaleSnap] = useState(0);
    const [positionSnap, setPositionSnap] = useState(0.5);
    const [rotationSnap, setRotationSnap] = useState(Math.PI / 4);
    const startingPrefab = initialPrefab ?? DEFAULT_PREFAB;
    const [prefabStore] = useState(() => createPrefabStore(startingPrefab));
    const [history, setHistory] = useState<Prefab[]>([startingPrefab]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const changeOriginRef = useRef<"replace" | "replace-silent" | "history" | null>(null);
    const historyIndexRef = useRef(0);
    const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);
    const prefabRootRef = useRef<PrefabRootRef>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const controlsRef = useRef<any>(null);
    const onChangeRef = useRef(onChange);
    const [injectedModels, setInjectedModels] = useState<LoadedModels>({});
    const [injectedTextures, setInjectedTextures] = useState<LoadedTextures>({});

    const getPrefab = useCallback(() => prefabStoreToPrefab(prefabStore.getState()), [prefabStore]);

    onChangeRef.current = onChange;

    const setSelection = useCallback((nodeId: string | null) => {
        const nextNode = nodeId ? prefabStore.getState().nodesById[nodeId] : null;
        if (nextNode?.locked) {
            return;
        }

        setSelectedId(nodeId);
    }, [prefabStore]);

    const toggleEditMode = () => {
        setEditMode(prev => {
            const next = !prev;
            if (!next) {
                setSelectedId(null);
                setSelectedObject(null);
            }
            return next;
        });
    };

    const loadPrefab = useCallback((prefab: Prefab, options?: { resetHistory?: boolean; notifyChange?: boolean }) => {
        changeOriginRef.current = options?.notifyChange === false ? "replace-silent" : "replace";
        prefabStore.getState().replacePrefab(prefab);
        setSelectedObject(null);

        if (options?.resetHistory) {
            setSelectedId(null);
            setInjectedModels({});
            setInjectedTextures({});
            setHistory([prefab]);
            historyIndexRef.current = 0;
            setHistoryIndex(0);
        } else {
            setSelectedId(prev => prev && prefabStore.getState().nodesById[prev] ? prev : null);
        }
    }, [prefabStore]);

    useEffect(() => {
        if (initialPrefab) loadPrefab(initialPrefab, { resetHistory: true, notifyChange: false });
    }, [initialPrefab, loadPrefab]);

    useEffect(() => {
        let historyTimeout: ReturnType<typeof setTimeout> | null = null;
        let lastRevision = prefabStore.getState().revision;

        const unsubscribe = prefabStore.subscribe((state) => {
            if (state.revision === lastRevision) {
                return;
            }

            lastRevision = state.revision;

            const nextPrefab = prefabStoreToPrefab(state);
            const changeOrigin = changeOriginRef.current;

            if (changeOrigin !== "replace-silent") {
                onChangeRef.current?.(nextPrefab);
            }

            if (historyTimeout) {
                clearTimeout(historyTimeout);
                historyTimeout = null;
            }

            if (changeOrigin || !editMode) {
                changeOriginRef.current = null;
                return;
            }

            historyTimeout = setTimeout(() => {
                const currentHistoryIndex = historyIndexRef.current;
                setHistory(prev => {
                    const nextHistory = [...prev.slice(0, currentHistoryIndex + 1), nextPrefab];
                    return nextHistory.length > 50 ? nextHistory.slice(1) : nextHistory;
                });
                const nextHistoryIndex = Math.min(currentHistoryIndex + 1, 49);
                historyIndexRef.current = nextHistoryIndex;
                setHistoryIndex(nextHistoryIndex);
                historyTimeout = null;
            }, 500);
        });

        return () => {
            if (historyTimeout) {
                clearTimeout(historyTimeout);
            }
            unsubscribe();
        };
    }, [editMode, prefabStore]);

    useEffect(() => {
        if (!selectedId) return;

        const unsubscribe = prefabStore.subscribe((state) => {
            if (state.nodesById[selectedId]) return;

            setSelectedId(null);
            setSelectedObject(null);
        });

        return () => unsubscribe();
    }, [prefabStore, selectedId]);

    useEffect(() => {
        if (!selectedId) {
            setSelectedObject(null);
            return;
        }

        setSelectedObject(prefabRootRef.current?.getObject(selectedId) ?? null);
    }, [selectedId]);

    const addNode = useCallback((node: GameObject, options?: SpawnOptions) => {
        const { addChild, rootId } = prefabStore.getState();
        addChild(options?.parentId ?? rootId, node);
        if (options?.select !== false) {
            setSelection(node.id);
        }
        return node;
    }, [prefabStore, setSelection]);

    const importPrefab = useCallback((prefab: Prefab) => {
        addNode(regenerateIds(prefab.root), { select: false });
    }, [addNode]);

    const addModel = useCallback((path: string, model: Object3D, options?: SpawnOptions) => {
        const node = createModelNode(path, options?.name);
        addNode(node, options);
        setInjectedModels(prev => ({ ...prev, [path]: model }));
        return node;
    }, [addNode]);

    const addTexture = useCallback((path: string, texture: Texture, options?: SpawnOptions) => {
        const node = createImageNode(path, options?.name);
        addNode(node, options);
        setInjectedTextures(prev => ({ ...prev, [path]: texture }));
        return node;
    }, [addNode]);

    const applyHistory = (index: number) => {
        changeOriginRef.current = "history";
        prefabStore.getState().replacePrefab(history[index]);
        historyIndexRef.current = index;
        setHistoryIndex(index);
        setSelectedObject(null);
        setSelectedId(prev => prev && prefabStore.getState().nodesById[prev] ? prev : null);
    };

    const undo = () => historyIndex > 0 && applyHistory(historyIndex - 1);
    const redo = () => historyIndex < history.length - 1 && applyHistory(historyIndex + 1);

    useEffect(() => {
        if (!editMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editMode, historyIndex, history]);

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

        const rootObject = prefabRootRef.current?.root;
        if (!rootObject) return;

        return exportGLBFile(rootObject, {
            filename: `${prefabStore.getState().prefabName || 'prefab'}.glb`,
            ...options,
        });
    }, [clearSelection, prefabStore]);

    const handleExportGLBData = useCallback(async () => {
        await clearSelection();

        const rootObject = prefabRootRef.current?.root;
        if (!rootObject) return;

        return exportGLBData(rootObject);
    }, [clearSelection]);

    const handleFocusNode = useCallback((nodeId: string) => {
        const object = prefabRootRef.current?.getObject(nodeId);
        const controls = controlsRef.current;
        const camera = controls?.object;

        if (!object || !controls || !camera) return;

        focusCameraOnObject(object, camera, controls.target, () => controls.update?.());
    }, []);

    const scene = useMemo(() => createScene({
        getRootId: () => prefabStore.getState().rootId,
        getNode: (id) => prefabStore.getState().nodesById[id] ?? null,
        updateNode: (id, update) => prefabStore.getState().updateNode(id, update),
        updateNodes: (updates) => prefabStore.getState().updateNodes(
            Object.entries(updates).map(([id, update]) => ({ id, update }))
        ),
        addNode: (node, options) => addNode(node, options).id,
        removeNode: (id) => prefabStore.getState().deleteNode(id),
    }), [addNode, prefabStore]);

    const handleTransformChange = () => {
        if (!selectedId) return;

        const object = prefabRootRef.current?.getObject(selectedId);
        if (!object) return;

        const parentWorld = computeParentWorldMatrix(prefabStore.getState(), selectedId);
        const local = parentWorld.clone().invert().multiply(object.matrixWorld);
        const { position, rotation, scale } = decompose(local);

        prefabStore.getState().updateNode(selectedId, node => ({
            ...node,
            components: {
                ...node.components,
                transform: {
                    type: "Transform",
                    properties: { position, rotation, scale },
                },
            },
        }));
    };

    // --- Drag & drop files to add nodes ---
    useEffect(() => {
        if (!enableWindowDrop || !editMode) return;

        function handleDragOver(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();
        }

        function handleDrop(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();

            const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];

            void loadFiles(files, {
                onModelLoaded: (model, filename) => {
                    addModel(`models/${filename}`, model, {
                        name: filename.replace(/\.[^.]+$/, '')
                    });
                },
                onTextureLoaded: (texture, filename) => {
                    addTexture(`textures/${filename}`, texture, {
                        name: filename.replace(/\.[^.]+$/, '')
                    });
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
    }, [addModel, addTexture, editMode, enableWindowDrop]);

    useImperativeHandle(ref, () => ({
        screenshot: handleScreenshot,
        exportGLB: handleExportGLB,
        exportGLBData: handleExportGLBData,
        clearSelection,
        save: getPrefab,
        scene,
        load: loadPrefab,
        addModel,
        addTexture,
        viewRef: prefabRootRef
    }), [addModel, addTexture, clearSelection, getPrefab, handleExportGLB, handleExportGLBData, handleScreenshot, loadPrefab, scene]);

    const content = (
        <>
            <ambientLight intensity={1.5} />
            <gridHelper args={[10, 10]} position={[0, -1, 0]} />
            <PrefabRoot
                ref={prefabRootRef}
                store={prefabStore}
                editMode={editMode}
                selectedId={selectedId}
                onSelect={setSelection}
                onSelectedObjectChange={editMode ? setSelectedObject : undefined}
                onFocusNode={editMode ? handleFocusNode : undefined}
                basePath={basePath}
                injectedModels={injectedModels}
                injectedTextures={injectedTextures}
            />
            {children}
        </>
    );

    return <PrefabStoreProvider store={prefabStore}><EditorContext.Provider value={{
        editMode,
        transformMode,
        setTransformMode,
        scaleSnap,
        setScaleSnap,
        positionSnap,
        setPositionSnap,
        rotationSnap,
        setRotationSnap,
        onFocusNode: editMode ? handleFocusNode : undefined,
        onScreenshot: handleScreenshot,
        onExportGLB: handleExportGLB
    }}>
        <GameCanvas
            camera={{ position: [0, 5, 15] }}
            canvasRef={canvasRef}
            {...canvasProps}
            onPointerMissed={editMode
                ? (event) => {
                    const button = event.button ?? (event as MouseEvent & { sourceEvent?: MouseEvent }).sourceEvent?.button ?? 0;
                    if (button === 0 && selectedId) {
                        setSelection(null);
                    }
                    canvasProps?.onPointerMissed?.(event);
                }
                : canvasProps?.onPointerMissed}
        >
            {physics ? (
                <Physics debug={editMode} paused={editMode}>
                    {content}
                </Physics>
            ) : content}

            {editMode && (
                <>
                    <MapControls ref={controlsRef} makeDefault />
                    {selectedObject && (
                        <TransformControls
                            key={`transform-${transformMode}-${positionSnap}-${rotationSnap}-${scaleSnap}`}
                            object={selectedObject}
                            mode={transformMode}
                            space="local"
                            onObjectChange={handleTransformChange}
                            translationSnap={positionSnap > 0 ? positionSnap : undefined}
                            rotationSnap={rotationSnap > 0 ? rotationSnap : undefined}
                            scaleSnap={scaleSnap > 0 ? scaleSnap : undefined}
                        />
                    )}
                </>
            )}
        </GameCanvas>

        {showUI && (
            <>
                <div style={toolbar.panel}>
                    <button style={base.btn} onClick={toggleEditMode}>
                        {editMode ? "▶" : "⏸"}
                    </button>
                    {uiPlugins}
                </div>
                {editMode && (
                    <EditorUI
                        selectedId={selectedId}
                        setSelectedId={setSelection}
                        getPrefab={getPrefab}
                        onReplacePrefab={(prefab: Prefab) => loadPrefab(prefab, { resetHistory: true })}
                        onImportPrefab={importPrefab}
                        basePath={basePath}
                        onUndo={undo}
                        onRedo={redo}
                        canUndo={historyIndex > 0}
                        canRedo={historyIndex < history.length - 1}
                    />
                )}
            </>
        )}
    </EditorContext.Provider></PrefabStoreProvider>
});

PrefabEditor.displayName = "PrefabEditor";

export default PrefabEditor;