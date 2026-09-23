import { OrbitControls, TransformControls, useHelper } from "@react-three/drei";
import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, forwardRef, useImperativeHandle } from "react";
import { BoxHelper, Plane, Vector2, Vector3 } from "three";
import type { Intersection, Object3D, Sprite, Texture } from "three";
import { useThree, type RootState } from "@react-three/fiber";
import { findComponentEntry } from "./types";
import type { GameObject, Prefab } from "./types";
import GameCanvas from "../../shared/GameCanvas";
import PrefabRoot from "./PrefabRoot";
import { AssetRuntimeProvider } from "./assetRuntime";
import type { AssetRuntime } from "./assetRuntime";
import { createPrefabRegistry, PrefabEditorMode } from "./SceneContext";
import type { PrefabApi, Scene } from "./SceneContext";
import { createDefaultMaterial, createImageNode, createModelNode, denormalizePrefab } from "./prefab";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";
import { exportGLB as exportGLBFile, exportGLBData, focusCameraOnObject, isExternalPath, withBasePath } from "./utils";
import type { ExportGLBOptions } from "./utils";
import { loadDroppedAssets } from "../dragdrop";
import { resolveManifestAssetPath } from "../dragdrop/modelLoader";
import { createPrefabStore, PrefabStoreProvider } from "./prefabStore";
import { createPrefabHistory } from "./prefabHistory";
import { createPrefabApi } from "./prefabApi";
import { GameEventsProvider } from "./GameEvents";
import type { OrbitControls as OrbitControlsImpl, TransformControls as TransformControlsImpl } from 'three-stdlib';
import type { DecomposeModelOptions, DecomposedPrefabNodes } from "./modelPrefab";
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

function DropPreview({ previewRef }: { previewRef: React.RefObject<Sprite | null>; }) {
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

function SelectionHelper({ object }: { object: Object3D | null; }) {
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

function RegisteredObject({ id, prefab, children }: { id: string; prefab: PrefabApi; children: (object: Object3D) => React.ReactNode; }) {
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
    /** Optional game/plugin model importer. Return null to keep the model as an asset reference. */
    importModel?: (model: Object3D, options: DecomposeModelOptions) => DecomposedPrefabNodes | null;
    canvasProps?: Omit<React.ComponentProps<typeof GameCanvas>, 'children'>;
    children?: React.ReactNode;
}

export type PrefabEditorProviderProps = Omit<PrefabEditorProps, 'showUI' | 'canvasProps'>;

function useEditorState({ basePath = "", prefab, mode: providedMode = PrefabEditorMode.Edit, onPointerEvent, enableWindowDrop = true, importModel }: PrefabEditorProviderProps) {
    const [mode, setMode] = useState<PrefabEditorMode>(providedMode);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const [scaleSnap, setScaleSnap] = useState(0);
    const [positionSnap, setPositionSnap] = useState(0.5);
    const [rotationSnap, setRotationSnap] = useState(Math.PI / 4);
    const [prefabStore] = useState(() => createPrefabStore(prefab));
    const [prefabRegistry] = useState(createPrefabRegistry);
    const [history] = useState(() => createPrefabHistory(prefabStore));
    const { canUndo, canRedo } = useSyncExternalStore(history.subscribe, history.getSnapshot, history.getSnapshot);
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
    const prefabValue = useMemo(() => createPrefabApi(prefabStore, prefabRegistry, () => runtimeRef.current, basePath), [basePath, prefabRegistry, prefabStore]);
    const { getObject, update } = prefabValue;
    const getRoot = useCallback(() => prefabValue.root, [prefabValue]);
    useLayoutEffect(() => history.connect(), [history]);
    useLayoutEffect(() => history.setEnabled(isEditMode), [history, isEditMode]);

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
        history.clear();
    }, [detachTransformControls, history, prefabStore]);

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

    const undo = useCallback(() => {
        detachTransformControls();
        history.undo();
    }, [detachTransformControls, history]);
    const redo = useCallback(() => {
        detachTransformControls();
        history.redo();
    }, [detachTransformControls, history]);

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

        const position = object.position.toArray();
        const rotation = [object.rotation.x, object.rotation.y, object.rotation.z];
        const scale = object.scale.toArray();

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
        const modelName = file.name.replace(/\.[^.]+$/, '');
        const modelIdPrefix = modelName.replace(/[^\w-]+/g, '-') || 'model';
        const textureRefs = new Map<string, Texture>();
        const decomposed = importModel?.(model, {
            idPrefix: modelIdPrefix,
            getTexturePath: (texture, usage) => {
                const key = `embedded/${modelIdPrefix}/${usage}/${texture.uuid}`;
                textureRefs.set(key, texture);
                return key;
            },
        });
        if (!decomposed) {
            if (!replaceId) {
                const node = offsetNodePosition(createModelNode(path, file.name.replace(/\.[^.]+$/, '')), position);
                prefabValue.add(node);
                setSelectedId(node.id);
            }
            return;
        }

        textureRefs.forEach((texture, texturePath) => {
            runtime?.registerTexture(withBasePath(basePath, texturePath), texture);
        });
        const node = offsetNodePosition({
            ...decomposed.root,
            name: modelName || decomposed.root.name,
        }, position);
        {
            const s = prefabStore.getState();
            Object.entries(decomposed.materials).forEach(([id, material]) => s.setMaterial(id, material));
            if (replaceId && s.nodesById[replaceId]) s.replaceNode(replaceId, node);
            else s.addChild(s.rootId, node);
        }
        setSelectedId(node.id);
    }, [basePath, importModel, prefabStore, prefabValue]);

    const addImageNode = useCallback((filename: string, file: File, position: Vec3) => {
        const path = getPrefabAssetRef(filename, 'textures');
        const name = file.name.replace(/\.[^.]+$/, '');
        const materialId = `material-${crypto.randomUUID()}`;
        const node = offsetNodePosition(createImageNode(path, materialId, name), position);
        {
            const s = prefabStore.getState();
            s.setMaterial(materialId, {
                ...createDefaultMaterial(),
                name,
                materialType: 'basic',
                texture: path,
                transparent: true,
            });
            s.addChild(s.rootId, node);
        }
        setSelectedId(node.id);
    }, [prefabStore]);

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
                    prefabValue.add(node);
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
    }, [addImageNode, addParsedModel, basePath, enableWindowDrop, isEditMode, prefabValue, toRootLocalPosition]);

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

    return {
        basePath, prefabStore, prefabValue, sceneValue, editorRefValue, runtimeRef,
        isEditMode, selectedId, setSelection, onPointerEvent, getRoot,
        canvasRef, canvasStateRef, dropPreviewRef, controlsRef, transformControlsRef,
        transformMode, setTransformMode, scaleSnap, setScaleSnap,
        positionSnap, setPositionSnap, rotationSnap, setRotationSnap,
        handleFocusNode, handleTransformChange, toggleMode, canUndo, canRedo,
    };
}

const EditorStateContext = createContext<ReturnType<typeof useEditorState> | null>(null);
function useEditorStateContext() {
    const state = useContext(EditorStateContext);
    if (!state) throw new Error('Editor scene and panel require PrefabEditorProvider');
    return state;
}

/** Owns editing state independently of the canvas and HTML layout. */
export const PrefabEditorProvider = forwardRef<PrefabEditorRef, PrefabEditorProviderProps>((props, ref) => {
    const state = useEditorState(props);
    useImperativeHandle(ref, () => state.editorRefValue, [state.editorRefValue]);
    return <GameEventsProvider>
        <PrefabStoreProvider store={state.prefabStore}>
            <AssetRuntimeProvider runtimeRef={state.runtimeRef}>
                <EditorStateContext.Provider value={state}>
                    <EditorRefContext.Provider value={state.editorRefValue}>
                        <EditorContext.Provider value={{
                            transformMode: state.transformMode, setTransformMode: state.setTransformMode,
                            scaleSnap: state.scaleSnap, setScaleSnap: state.setScaleSnap,
                            positionSnap: state.positionSnap, setPositionSnap: state.setPositionSnap,
                            rotationSnap: state.rotationSnap, setRotationSnap: state.setRotationSnap,
                            onFocusNode: state.isEditMode ? state.handleFocusNode : undefined,
                        }}>{props.children}</EditorContext.Provider>
                    </EditorRefContext.Provider>
                </EditorStateContext.Provider>
            </AssetRuntimeProvider>
        </PrefabStoreProvider>
    </GameEventsProvider>;
});

/** R3F content: mount inside your GameCanvas. */
export function PrefabEditorScene({ children }: { children?: React.ReactNode; }) {
    const {
        basePath, prefabStore, prefabValue, sceneValue, isEditMode, selectedId,
        setSelection, onPointerEvent, getRoot, canvasRef, canvasStateRef,
        dropPreviewRef, controlsRef, transformControlsRef, transformMode,
        positionSnap, rotationSnap, scaleSnap, handleTransformChange,
    } = useEditorStateContext();
    const get = useThree(state => state.get);
    useLayoutEffect(() => {
        const state = get();
        canvasRef.current = state.gl.domElement as HTMLCanvasElement;
        canvasStateRef.current = state;
        return () => { canvasRef.current = null; canvasStateRef.current = null; };
    }, [get, canvasRef, canvasStateRef]);
    useLayoutEffect(() => {
        if (!isEditMode) return;
        const state = get();
        const previous = state.onPointerMissed;
        state.set({
            onPointerMissed: event => {
                if (event.button === 0) setSelection(null);
                previous?.(event);
            }
        });
        return () => state.set({ onPointerMissed: previous });
    }, [get, isEditMode, setSelection]);
    return <>
        {isEditMode ? <gridHelper args={[10, 10]} position={[0, -0.001, 0]} /> : null}
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
    </>;
}

/** HTML controls: mount beside the canvas under the same provider. */
export function PrefabEditorPanel() {
    const { isEditMode, toggleMode, selectedId, setSelection, canUndo, canRedo } = useEditorStateContext();
    return (
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
                    canUndo={canUndo}
                    canRedo={canRedo}
                />
            )}
        </>
    );
}

/** Convenient complete editor; the provider/scene/panel are also independently composable. */
const PrefabEditor = forwardRef<PrefabEditorRef, PrefabEditorProps>(({ canvasProps, showUI = true, children, ...props }, ref) =>
    <PrefabEditorProvider {...props} ref={ref}>
        <GameCanvas camera={{ position: [0, 5, 15] }} {...canvasProps}>
            <PrefabEditorScene>{children}</PrefabEditorScene>
        </GameCanvas>
        {showUI && <PrefabEditorPanel />}
    </PrefabEditorProvider>
);
PrefabEditor.displayName = "PrefabEditor";
export default PrefabEditor;
