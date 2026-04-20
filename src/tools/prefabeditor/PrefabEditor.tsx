import { MapControls, TransformControls, useHelper } from "@react-three/drei";
import GameCanvas from "../../shared/GameCanvas";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle, createContext, useContext } from "react";
import { BoxHelper, Object3D, Texture } from "three";
import { GameObject, Prefab, findComponentEntry } from "./types";
import PrefabRoot, { PrefabRootRef } from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";
import { computeParentWorldMatrix, decompose, exportGLB as exportGLBFile, exportGLBData, focusCameraOnObject, regenerateIds } from "./utils";
import type { ExportGLBOptions } from "./utils";
import { loadFiles } from "../dragdrop";
import { denormalizePrefab, createImageNode, createModelNode, createNode } from './prefab';
import { createPrefabStore, type PrefabStoreApi, PrefabStoreProvider } from "./prefabStore";
import type { SpawnOptions } from "./scene";

function isObjectAttachedToRoot(root: Object3D | null | undefined, object: Object3D | null | undefined) {
    if (!root || !object) return false;

    let current: Object3D | null = object;
    while (current) {
        if (current === root) return true;
        current = current.parent;
    }

    return false;
}

function SelectionHelper({ object }: { object: Object3D | null }) {
    const objectRef = useRef<Object3D | null>(null);
    objectRef.current = object;
    useHelper(object ? objectRef as React.RefObject<Object3D> : null, BoxHelper, "cyan");
    return null;
}

export interface PrefabEditorRef {
    root: Object3D | null;
    store: PrefabStoreApi;
    getObject: (nodeId: string) => Object3D | null;
    getRigidBody: (nodeId: string) => any;
    screenshot: () => void;
    exportGLB: (options?: ExportGLBOptions) => Promise<ArrayBuffer | undefined>;
    exportGLBData: () => Promise<ArrayBuffer | undefined>;
    clearSelection: () => Promise<void>;
    save: () => Prefab;
    load: (prefab: Prefab, options?: { resetHistory?: boolean; notifyChange?: boolean }) => void;
    addNode: (node: GameObject, options?: SpawnOptions) => GameObject;
    addModel: (path: string, model: Object3D, options?: SpawnOptions) => GameObject;
    addTexture: (path: string, texture: Texture, options?: SpawnOptions) => GameObject;
}

export enum PrefabEditorMode {
    Edit = "edit",
    Play = "play",
}

export interface EditorContextType {
    mode: PrefabEditorMode;
    setMode: (mode: PrefabEditorMode) => void;
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
    scaleSnap: number;
    setScaleSnap: (resolution: number) => void;
    positionSnap: number;
    setPositionSnap: (resolution: number) => void;
    rotationSnap: number;
    setRotationSnap: (resolution: number) => void;
    onFocusNode?: (nodeId: string) => void;
    onScreenshot?: () => void;
    onExportGLB?: () => void;
}

export const EditorContext = createContext<EditorContextType | null>(null);

export function useEditorContext() {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error("useEditorContext must be used within EditorContext.Provider");
    }
    return context;
}

export interface PrefabEditorProps {
    basePath?: string;
    initialPrefab?: Prefab;
    physics?: boolean;
    mode?: PrefabEditorMode;
    onChange?: (prefab: Prefab) => void;
    showUI?: boolean;
    enableWindowDrop?: boolean;
    canvasProps?: Omit<React.ComponentProps<typeof GameCanvas>, 'children'>;
    uiPlugins?: React.ReactNode[] | React.ReactNode;
    children?: React.ReactNode;
}

const MAX_HISTORY_LENGTH = 50;
const HISTORY_DEBOUNCE_MS = 500;

const DEFAULT_PREFAB: Prefab = {
    id: "prefab-default",
    name: "New Prefab",
    root: createNode('Root', {}, { id: 'root' })
};

const PrefabEditor = forwardRef<PrefabEditorRef, PrefabEditorProps>(({ basePath, initialPrefab, physics = true, mode: initialMode = PrefabEditorMode.Edit, onChange, showUI = true, enableWindowDrop = true, canvasProps, uiPlugins, children }, ref) => {
    const [mode, setMode] = useState<PrefabEditorMode>(initialMode);
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
    const prefabRootRef = useRef<PrefabRootRef>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const controlsRef = useRef<any>(null);
    const transformControlsRef = useRef<any>(null);
    const transformProxyRef = useRef<Object3D | null>(null);
    const onChangeRef = useRef(onChange);
    const isEditMode = mode === PrefabEditorMode.Edit;

    const getPrefab = useCallback(() => denormalizePrefab(prefabStore.getState()), [prefabStore]);
    const getRootObject = useCallback(() => prefabRootRef.current?.root ?? null, []);
    const getObject = useCallback((nodeId: string) => prefabRootRef.current?.getObject(nodeId) ?? null, []);
    const getRigidBody = useCallback((nodeId: string) => prefabRootRef.current?.getRigidBody(nodeId) ?? null, []);

    onChangeRef.current = onChange;

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

    useEffect(() => {
        updateMode(initialMode);
    }, [initialMode, updateMode]);

    const loadPrefab = useCallback((prefab: Prefab, options?: { resetHistory?: boolean; notifyChange?: boolean }) => {
        changeOriginRef.current = options?.notifyChange === false ? "replace-silent" : "replace";
        transformControlsRef.current?.detach();
        prefabStore.getState().replacePrefab(prefab);

        if (options?.resetHistory) {
            setSelectedId(null);
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

            const nextPrefab = denormalizePrefab(state);
            const changeOrigin = changeOriginRef.current;

            if (changeOrigin !== "replace-silent") {
                onChangeRef.current?.(nextPrefab);
            }

            if (historyTimeout) {
                clearTimeout(historyTimeout);
                historyTimeout = null;
            }

            if (changeOrigin || !isEditMode) {
                changeOriginRef.current = null;
                return;
            }

            historyTimeout = setTimeout(() => {
                const currentHistoryIndex = historyIndexRef.current;
                setHistory(prev => {
                    const nextHistory = [...prev.slice(0, currentHistoryIndex + 1), nextPrefab];
                    return nextHistory.length > MAX_HISTORY_LENGTH ? nextHistory.slice(1) : nextHistory;
                });
                const nextHistoryIndex = Math.min(currentHistoryIndex + 1, MAX_HISTORY_LENGTH - 1);
                historyIndexRef.current = nextHistoryIndex;
                setHistoryIndex(nextHistoryIndex);
                historyTimeout = null;
            }, HISTORY_DEBOUNCE_MS);
        });

        return () => {
            if (historyTimeout) {
                clearTimeout(historyTimeout);
            }
            unsubscribe();
        };
    }, [isEditMode, prefabStore]);

    useEffect(() => {
        if (!selectedId) return;

        const unsubscribe = prefabStore.subscribe((state) => {
            if (state.nodesById[selectedId]) return;

            setSelectedId(null);
        });

        return () => unsubscribe();
    }, [prefabStore, selectedId]);

    const selectedNode = selectedId ? prefabStore.getState().nodesById[selectedId] ?? null : null;
    const selectedObject = selectedId ? getObject(selectedId) : null;
    const selectedHasPhysics = Object.values(selectedNode?.components ?? {}).some(component => component?.type === "Physics");
    const transformObject = isEditMode && (selectedHasPhysics ? transformProxyRef.current : selectedObject)
        && isObjectAttachedToRoot(getRootObject(), selectedObject)
        ? (selectedHasPhysics ? transformProxyRef.current : selectedObject)
        : null;

    useLayoutEffect(() => {
        if (!isEditMode || !selectedHasPhysics || !selectedObject || !transformProxyRef.current) {
            return;
        }

        selectedObject.updateMatrixWorld(true);
        transformProxyRef.current.matrixAutoUpdate = true;
        selectedObject.matrixWorld.decompose(
            transformProxyRef.current.position,
            transformProxyRef.current.quaternion,
            transformProxyRef.current.scale,
        );
        transformProxyRef.current.updateMatrix();
        transformProxyRef.current.updateMatrixWorld(true);
    }, [isEditMode, selectedHasPhysics, selectedId, selectedObject]);

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
        prefabRootRef.current?.addModel(path, model);
        return node;
    }, [addNode]);

    const addTexture = useCallback((path: string, texture: Texture, options?: SpawnOptions) => {
        const node = createImageNode(path, options?.name);
        addNode(node, options);
        prefabRootRef.current?.addTexture(path, texture);
        return node;
    }, [addNode]);

    const applyHistory = (index: number) => {
        changeOriginRef.current = "history";
        transformControlsRef.current?.detach();
        prefabStore.getState().replacePrefab(history[index]);
        historyIndexRef.current = index;
        setHistoryIndex(index);
        setSelectedId(prev => prev && prefabStore.getState().nodesById[prev] ? prev : null);
    };

    const undo = () => historyIndex > 0 && applyHistory(historyIndex - 1);
    const redo = () => historyIndex < history.length - 1 && applyHistory(historyIndex + 1);

    useEffect(() => {
        if (!isEditMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, historyIndex, history]);

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

        const rootObject = getRootObject();
        if (!rootObject) return;

        return exportGLBFile(rootObject, {
            filename: `${prefabStore.getState().prefabName || 'prefab'}.glb`,
            ...options,
        });
    }, [clearSelection, getRootObject, prefabStore]);

    const handleExportGLBData = useCallback(async () => {
        await clearSelection();

        const rootObject = getRootObject();
        if (!rootObject) return;

        return exportGLBData(rootObject);
    }, [clearSelection, getRootObject]);

    const handleFocusNode = useCallback((nodeId: string) => {
        const object = getObject(nodeId);
        const controls = controlsRef.current;
        const camera = controls?.object;

        if (!object || !controls || !camera) return;

        focusCameraOnObject(object, camera, controls.target, () => controls.update?.());
    }, [getObject]);

    const handleTransformChange = () => {
        if (!selectedId) return;

        const object = selectedHasPhysics ? transformProxyRef.current : getObject(selectedId);
        if (!object) return;

        const parentWorld = computeParentWorldMatrix(prefabStore.getState(), selectedId);
        const local = parentWorld.clone().invert().multiply(object.matrixWorld);
        const { position, rotation, scale } = decompose(local);

        prefabStore.getState().updateNode(selectedId, node => {
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
    }, [addModel, addTexture, isEditMode, enableWindowDrop]);

    useImperativeHandle(ref, () => ({
        root: getRootObject(),
        store: prefabStore,
        getObject,
        getRigidBody,
        screenshot: handleScreenshot,
        exportGLB: handleExportGLB,
        exportGLBData: handleExportGLBData,
        clearSelection,
        save: getPrefab,
        load: loadPrefab,
        addNode,
        addModel,
        addTexture
    }), [addModel, addNode, addTexture, clearSelection, getObject, getPrefab, getRigidBody, getRootObject, handleExportGLB, handleExportGLBData, handleScreenshot, loadPrefab, prefabStore]);

    const content = (
        <>
            {isEditMode ? <gridHelper args={[10, 10]} position={[0, -1, 0]} /> : null}
            <PrefabRoot
                ref={prefabRootRef}
                store={prefabStore}
                editMode={isEditMode}
                selectedId={selectedId}
                onSelect={setSelection}
                basePath={basePath}
            />
            {children}
        </>
    );

    const handleCanvasCreated = useCallback((state: Parameters<NonNullable<React.ComponentProps<typeof GameCanvas>["onCreated"]>>[0]) => {
        canvasRef.current = state.gl.domElement as HTMLCanvasElement;
        canvasProps?.onCreated?.(state);
    }, [canvasProps]);

    return <PrefabStoreProvider store={prefabStore}><EditorContext.Provider value={{
        mode,
        setMode: updateMode,
        transformMode,
        setTransformMode,
        scaleSnap,
        setScaleSnap,
        positionSnap,
        setPositionSnap,
        rotationSnap,
        setRotationSnap,
        onFocusNode: isEditMode ? handleFocusNode : undefined,
        onScreenshot: handleScreenshot,
        onExportGLB: handleExportGLB
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
            {physics ? (
                <Physics colliders={false} debug={isEditMode} paused={isEditMode}>
                    {content}
                </Physics>
            ) : content}
            <group ref={transformProxyRef} visible={false} />
            {isEditMode ? <SelectionHelper object={transformObject} /> : null}

            {isEditMode && (
                <>
                    <MapControls ref={controlsRef} enableDamping={false} makeDefault />
                    {transformObject && (
                        <TransformControls
                            ref={transformControlsRef}
                            key={`transform-${selectedId}-${transformMode}-${positionSnap}-${rotationSnap}-${scaleSnap}`}
                            object={transformObject}
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
                    <button style={base.btn} onClick={toggleMode}>
                        {isEditMode ? "▶" : "⏸"}
                    </button>
                    {uiPlugins}
                </div>
                {isEditMode && (
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