"use client";

import GameCanvas from "../../shared/GameCanvas";
import { useState, useRef, useEffect } from "react";
import { Prefab } from "./types";
import PrefabRoot from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";

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

const PrefabEditor = ({ basePath, initialPrefab, onPrefabChange, children }: {
    basePath?: string;
    initialPrefab?: Prefab;
    onPrefabChange?: (prefab: Prefab) => void;
    children?: React.ReactNode;
}) => {
    const [editMode, setEditMode] = useState(true);
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab>(initialPrefab ?? DEFAULT_PREFAB);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const [history, setHistory] = useState<Prefab[]>([loadedPrefab]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const throttleRef = useRef<NodeJS.Timeout | null>(null);
    const lastDataRef = useRef(JSON.stringify(loadedPrefab));

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

    const handleLoad = async () => {
        const prefab = await loadJson();
        if (prefab) {
            setLoadedPrefab(prefab);
            onPrefabChange?.(prefab);
            setHistory([prefab]);
            setHistoryIndex(0);
            lastDataRef.current = JSON.stringify(prefab);
        }
    };

    return <>
        <GameCanvas>
            <Physics paused={editMode}>
                <ambientLight intensity={1.5} />
                <gridHelper args={[10, 10]} position={[0, -1, 0]} />
                <PrefabRoot
                    data={loadedPrefab}
                    editMode={editMode}
                    onPrefabChange={updatePrefab}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    transformMode={transformMode}
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
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            basePath={basePath}
            onSave={() => saveJson(loadedPrefab, "prefab")}
            onLoad={handleLoad}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
        />}
    </>
}


const saveJson = (data: Prefab, filename: string) => {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    a.download = `${filename || 'prefab'}.json`;
    a.click();
};

const loadJson = () => new Promise<Prefab | undefined>(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return resolve(undefined);
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const text = e.target?.result;
                if (typeof text === 'string') resolve(JSON.parse(text) as Prefab);
            } catch (err) {
                console.error('Error parsing prefab JSON:', err);
                resolve(undefined);
            }
        };
        reader.readAsText(file);
    };
    input.click();
});

export default PrefabEditor;