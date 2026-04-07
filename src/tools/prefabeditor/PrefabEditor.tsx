import { MapControls, TransformControls } from "@react-three/drei";
import GameCanvas from "../../shared/GameCanvas";
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, SetStateAction } from "react";
import { Object3D, Texture } from "three";
import { GameObject, Prefab } from "./types";
import PrefabRoot, { PrefabRootRef } from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";
import { EditorContext } from "./EditorContext";
import { computeParentWorldMatrix, createImageNode, createModelNode, decompose, exportGLB as exportSceneGLB, exportGLBData, findNode, focusCameraOnObject, insertNode, updateNode } from "./utils";
import type { ExportGLBOptions } from "./utils";
import { loadFiles } from "../dragdrop";

export interface PrefabEditorAssetOptions {
    name?: string;
    parentId?: string;
    select?: boolean;
}

export interface PrefabEditorRef {
    screenshot: () => void;
    exportGLB: (options?: ExportGLBOptions) => Promise<ArrayBuffer | object | undefined>;
    exportGLBData: () => Promise<ArrayBuffer | undefined>;
    clearSelection: () => Promise<void>;
    prefab: Prefab;
    setPrefab: (prefab: Prefab) => void;
    replacePrefab: (prefab: Prefab) => void;
    addModel: (path: string, model: Object3D, options?: PrefabEditorAssetOptions) => GameObject;
    addTexture: (path: string, texture: Texture, options?: PrefabEditorAssetOptions) => GameObject;
    rootRef: React.RefObject<PrefabRootRef | null>;
}

export interface PrefabEditorProps {
    basePath?: string;
    initialPrefab?: Prefab;
    physics?: boolean;
    onPrefabChange?: (prefab: Prefab) => void;
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

const PrefabEditor = forwardRef<PrefabEditorRef, PrefabEditorProps>(({ basePath, initialPrefab, physics = true, onPrefabChange, showUI = true, enableWindowDrop = true, canvasProps, uiPlugins, children }, ref) => {
    const [editMode, setEditMode] = useState(true);
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab>(initialPrefab ?? DEFAULT_PREFAB);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const [snapResolution, setSnapResolution] = useState(0);
    const [positionSnap, setPositionSnap] = useState(0.5);
    const [rotationSnap, setRotationSnap] = useState(Math.PI / 4);
    const [history, setHistory] = useState<Prefab[]>([loadedPrefab]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);
    const throttleRef = useRef<NodeJS.Timeout | null>(null);
    const lastDataRef = useRef(JSON.stringify(loadedPrefab));
    const prefabRootRef = useRef<PrefabRootRef>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const controlsRef = useRef<any>(null);
    const onPrefabChangeRef = useRef(onPrefabChange);
    const pendingPrefabChangeRef = useRef<Prefab | null>(null);
    const [injectedModels, setInjectedModels] = useState<Record<string, Object3D>>({});
    const [injectedTextures, setInjectedTextures] = useState<Record<string, Texture>>({});

    onPrefabChangeRef.current = onPrefabChange;

    const setSelection = (nodeId: string | null) => {
        const nextNode = nodeId ? findNode(loadedPrefab.root, nodeId) : null;
        if (nextNode?.locked) {
            return;
        }

        setSelectedId(nodeId);
        setSelectedObject(nodeId ? prefabRootRef.current?.getObject(nodeId) ?? null : null);
    };

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

    const setSelectedIdState = (value: SetStateAction<string | null>) => {
        setSelection(typeof value === 'function' ? value(selectedId) : value);
    };

    const replacePrefab = (prefab: Prefab, options?: { notifyChange?: boolean }) => {
        if (throttleRef.current) clearTimeout(throttleRef.current);
        lastDataRef.current = JSON.stringify(prefab);
        pendingPrefabChangeRef.current = options?.notifyChange === false ? null : prefab;
        setSelection(null);
        setInjectedModels({});
        setInjectedTextures({});
        setHistory([prefab]);
        setHistoryIndex(0);
        setLoadedPrefab(prefab);
    };

    const setPrefab = (prefab: Prefab) => {
        if (selectedId && !findNode(prefab.root, selectedId)) {
            setSelection(null);
        }

        updatePrefab(prefab);
    };

    useEffect(() => {
        if (initialPrefab) replacePrefab(initialPrefab, { notifyChange: false });
    }, [initialPrefab]);

    const updatePrefab = (newPrefab: Prefab | ((prev: Prefab) => Prefab)) => {
        setLoadedPrefab(prev => {
            const resolved = typeof newPrefab === 'function' ? newPrefab(prev) : newPrefab;
            if (Object.is(resolved, prev)) {
                pendingPrefabChangeRef.current = null;
                return prev;
            }
            pendingPrefabChangeRef.current = resolved;
            return resolved;
        });
    };

    useEffect(() => {
        if (pendingPrefabChangeRef.current !== loadedPrefab) return;
        onPrefabChangeRef.current?.(loadedPrefab);
        pendingPrefabChangeRef.current = null;
    }, [loadedPrefab]);

    const insertPrefabNode = (node: GameObject, options?: PrefabEditorAssetOptions) => {
        updatePrefab(prev => {
            return { ...prev, root: insertNode(prev.root, node, options?.parentId) };
        });

        if (options?.select !== false) {
            setSelection(node.id);
        }

        return node;
    };

    const addModel = (path: string, model: Object3D, options?: PrefabEditorAssetOptions) => {
        const node = createModelNode(path, options?.name);
        insertPrefabNode(node, options);
        setInjectedModels(prev => ({ ...prev, [path]: model }));
        return node;
    };

    const addTexture = (path: string, texture: Texture, options?: PrefabEditorAssetOptions) => {
        const node = createImageNode(path, options?.name);
        insertPrefabNode(node, options);
        setInjectedTextures(prev => ({ ...prev, [path]: texture }));
        return node;
    };

    const applyHistory = (index: number) => {
        setHistoryIndex(index);
        lastDataRef.current = JSON.stringify(history[index]);
        pendingPrefabChangeRef.current = history[index];
        setLoadedPrefab(history[index]);
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

    useEffect(() => {
        const currentStr = JSON.stringify(loadedPrefab);
        if (currentStr === lastDataRef.current) return;
        if (throttleRef.current) clearTimeout(throttleRef.current);

        throttleRef.current = setTimeout(() => {
            lastDataRef.current = currentStr;
            setHistory(prev => {
                const newHistory = [...prev.slice(0, historyIndex + 1), loadedPrefab];
                return newHistory.length > 50 ? newHistory.slice(1) : newHistory;
            });
            setHistoryIndex(prev => Math.min(prev + 1, 49));
        }, 500);

        return () => { if (throttleRef.current) clearTimeout(throttleRef.current); };
    }, [loadedPrefab]);

    const handleScreenshot = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${loadedPrefab.name || 'screenshot'}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    };

    const clearSelection = async () => {
        if (!selectedId) return;

        setSelection(null);

        await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve());
            });
        });
    };

    const handleExportGLB = async (options: ExportGLBOptions = {}) => {
        await clearSelection();

        const sceneRoot = prefabRootRef.current?.root;
        if (!sceneRoot) return;

        return exportSceneGLB(sceneRoot, {
            filename: `${loadedPrefab.name || 'scene'}.glb`,
            ...options,
        });
    };

    const handleExportGLBData = async () => {
        await clearSelection();

        const sceneRoot = prefabRootRef.current?.root;
        if (!sceneRoot) return;

        return exportGLBData(sceneRoot);
    };

    const handleFocusNode = (nodeId: string) => {
        const object = prefabRootRef.current?.getObject(nodeId);
        const controls = controlsRef.current;
        const camera = controls?.object;

        if (!object || !controls || !camera) return;

        focusCameraOnObject(object, camera, controls.target, () => controls.update?.());
    };

    const handleTransformChange = () => {
        if (!selectedId) return;

        const object = prefabRootRef.current?.getObject(selectedId);
        if (!object) return;

        const parentWorld = computeParentWorldMatrix(loadedPrefab.root, selectedId);
        const local = parentWorld.clone().invert().multiply(object.matrixWorld);
        const { position, rotation, scale } = decompose(local);

        updatePrefab(prev => ({
            ...prev,
            root: updateNode(prev.root, selectedId, node => ({
                ...node,
                components: {
                    ...node.components,
                    transform: {
                        type: "Transform",
                        properties: { position, rotation, scale },
                    },
                },
            })),
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
    }, [editMode, enableWindowDrop]);

    useImperativeHandle(ref, () => ({
        screenshot: handleScreenshot,
        exportGLB: handleExportGLB,
        exportGLBData: handleExportGLBData,
        clearSelection,
        prefab: loadedPrefab,
        setPrefab,
        replacePrefab,
        addModel,
        addTexture,
        rootRef: prefabRootRef
    }));

    const content = (
        <>
            <ambientLight intensity={1.5} />
            <gridHelper args={[10, 10]} position={[0, -1, 0]} />
            <PrefabRoot
                ref={prefabRootRef}
                data={loadedPrefab}
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

    return <EditorContext.Provider value={{
        editMode,
        transformMode,
        setTransformMode,
        snapResolution,
        setSnapResolution,
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
                            key={`transform-${transformMode}-${positionSnap}-${rotationSnap}-${snapResolution}`}
                            object={selectedObject}
                            mode={transformMode}
                            space="local"
                            onObjectChange={handleTransformChange}
                            translationSnap={positionSnap > 0 ? positionSnap : undefined}
                            rotationSnap={rotationSnap > 0 ? rotationSnap : undefined}
                            scaleSnap={snapResolution > 0 ? snapResolution : undefined}
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
                        prefabData={loadedPrefab}
                        setPrefabData={updatePrefab}
                        selectedId={selectedId}
                        setSelectedId={setSelectedIdState}
                        basePath={basePath}
                        onUndo={undo}
                        onRedo={redo}
                        canUndo={historyIndex > 0}
                        canRedo={historyIndex < history.length - 1}
                    />
                )}
            </>
        )}
    </EditorContext.Provider>
});

PrefabEditor.displayName = "PrefabEditor";

export default PrefabEditor;