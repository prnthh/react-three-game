import GameCanvas from "../../shared/GameCanvas";
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Prefab } from "./types";
import PrefabRoot, { PrefabRootRef } from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";
import { EditorContext } from "./EditorContext";
import { exportGLB } from "./utils";

export interface PrefabEditorRef {
    screenshot: () => void;
    exportGLB: () => void;
    prefab: Prefab;
    setPrefab: (prefab: Prefab) => void;
    rootRef: React.RefObject<PrefabRootRef | null>;
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

const PrefabEditor = forwardRef<PrefabEditorRef, {
    basePath?: string;
    initialPrefab?: Prefab;
    onPrefabChange?: (prefab: Prefab) => void;
    children?: React.ReactNode;
}>(({ basePath, initialPrefab, onPrefabChange, children }, ref) => {
    const [editMode, setEditMode] = useState(true);
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab>(initialPrefab ?? DEFAULT_PREFAB);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const [snapResolution, setSnapResolution] = useState(0);
    const [history, setHistory] = useState<Prefab[]>([loadedPrefab]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const throttleRef = useRef<NodeJS.Timeout | null>(null);
    const lastDataRef = useRef(JSON.stringify(loadedPrefab));
    const prefabRootRef = useRef<PrefabRootRef>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (initialPrefab) setLoadedPrefab(initialPrefab);
    }, [initialPrefab]);

    const updatePrefab = (newPrefab: Prefab | ((prev: Prefab) => Prefab)) => {
        setLoadedPrefab(newPrefab);
        const resolved = typeof newPrefab === 'function' ? newPrefab(loadedPrefab) : newPrefab;
        onPrefabChange?.(resolved);
    };

    const applyHistory = (index: number) => {
        setHistoryIndex(index);
        lastDataRef.current = JSON.stringify(history[index]);
        setLoadedPrefab(history[index]);
        onPrefabChange?.(history[index]);
    };

    const undo = () => historyIndex > 0 && applyHistory(historyIndex - 1);
    const redo = () => historyIndex < history.length - 1 && applyHistory(historyIndex + 1);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [historyIndex, history]);

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

    const handleExportGLB = () => {
        const sceneRoot = prefabRootRef.current?.root;
        if (!sceneRoot) return;

        exportGLB(sceneRoot, {
            filename: `${loadedPrefab.name || 'scene'}.glb`
        });
    };

    useEffect(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) canvasRef.current = canvas;
    }, []);

    useImperativeHandle(ref, () => ({
        screenshot: handleScreenshot,
        exportGLB: handleExportGLB,
        prefab: loadedPrefab,
        setPrefab: setLoadedPrefab,
        rootRef: prefabRootRef
    }), [loadedPrefab]);

    return <EditorContext.Provider value={{
        transformMode,
        setTransformMode,
        snapResolution,
        setSnapResolution,
        onScreenshot: handleScreenshot,
        onExportGLB: handleExportGLB
    }}>
        <GameCanvas>
            <Physics debug={editMode} paused={editMode}>
                <ambientLight intensity={1.5} />
                <gridHelper args={[10, 10]} position={[0, -1, 0]} />
                <PrefabRoot
                    ref={prefabRootRef}
                    data={loadedPrefab}
                    editMode={editMode}
                    onPrefabChange={updatePrefab}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    basePath={basePath}
                />
                {children}
            </Physics>
        </GameCanvas>

        <div style={toolbar.panel}>
            <button style={base.btn} onClick={() => setEditMode(!editMode)}>
                {editMode ? "▶" : "⏸"}
            </button>
        </div>
        {editMode && <EditorUI
            prefabData={loadedPrefab}
            setPrefabData={updatePrefab}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            basePath={basePath}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
        />}
    </EditorContext.Provider>
});

PrefabEditor.displayName = "PrefabEditor";

export default PrefabEditor;