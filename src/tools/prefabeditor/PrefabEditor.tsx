"use client";

import GameCanvas from "../../shared/GameCanvas";
import { useState, useRef, useEffect } from "react";
import { Prefab } from "./types";
import PrefabRoot from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";
import { base, toolbar } from "./styles";

const PrefabEditor = ({ basePath, initialPrefab, onPrefabChange, children }: { basePath?: string, initialPrefab?: Prefab, onPrefabChange?: (prefab: Prefab) => void, children?: React.ReactNode }) => {
    const [editMode, setEditMode] = useState(true);
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab>(initialPrefab ?? {
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
    });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");

    // Sync internal state with external initialPrefab prop
    useEffect(() => {
        if (initialPrefab) {
            setLoadedPrefab(initialPrefab);
        }
    }, [initialPrefab]);

    // Wrapper to update prefab and notify parent
    const updatePrefab = (newPrefab: Prefab | ((prev: Prefab) => Prefab)) => {
        setLoadedPrefab(newPrefab);
        const resolved = typeof newPrefab === 'function' ? newPrefab(loadedPrefab) : newPrefab;
        onPrefabChange?.(resolved);
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

        <SaveDataPanel
            currentData={loadedPrefab}
            onDataChange={updatePrefab}
            editMode={editMode}
            onEditModeChange={setEditMode}
        />
        {editMode && <EditorUI
            prefabData={loadedPrefab}
            setPrefabData={updatePrefab}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            basePath={basePath}
        />}
    </>
}

const SaveDataPanel = ({
    currentData,
    onDataChange,
    editMode,
    onEditModeChange
}: {
    currentData: Prefab;
    onDataChange: (data: Prefab) => void;
    editMode: boolean;
    onEditModeChange: (mode: boolean) => void;
}) => {
    const [history, setHistory] = useState<Prefab[]>([currentData]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const throttleRef = useRef<NodeJS.Timeout | null>(null);
    const lastDataRef = useRef<string>(JSON.stringify(currentData));

    const undo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            lastDataRef.current = JSON.stringify(history[newIndex]);
            onDataChange(history[newIndex]);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            lastDataRef.current = JSON.stringify(history[newIndex]);
            onDataChange(history[newIndex]);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [historyIndex, history]);

    useEffect(() => {
        const currentStr = JSON.stringify(currentData);
        if (currentStr === lastDataRef.current) return;

        if (throttleRef.current) clearTimeout(throttleRef.current);

        throttleRef.current = setTimeout(() => {
            lastDataRef.current = currentStr;
            setHistory(prev => {
                const newHistory = [...prev.slice(0, historyIndex + 1), currentData];
                return newHistory.length > 50 ? newHistory.slice(1) : newHistory;
            });
            setHistoryIndex(prev => Math.min(prev + 1, 49));
        }, 500);

        return () => {
            if (throttleRef.current) clearTimeout(throttleRef.current);
        };
    }, [currentData]);

    const handleLoad = async () => {
        const prefab = await loadJson();
        if (prefab) {
            onDataChange(prefab);
            setHistory([prefab]);
            setHistoryIndex(0);
            lastDataRef.current = JSON.stringify(prefab);
        }
    };

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    return <div style={toolbar.panel}>
        <button style={base.btn} onClick={() => onEditModeChange(!editMode)}>
            {editMode ? "▶" : "⏸"}
        </button>
        <div style={toolbar.divider} />
        <button style={{ ...base.btn, ...(canUndo ? {} : toolbar.disabled) }} onClick={undo} disabled={!canUndo}>↶</button>
        <button style={{ ...base.btn, ...(canRedo ? {} : toolbar.disabled) }} onClick={redo} disabled={!canRedo}>↷</button>
        <div style={toolbar.divider} />
        <button style={base.btn} onClick={handleLoad}>📥</button>
        <button style={base.btn} onClick={() => saveJson(currentData, "prefab")}>💾</button>
    </div>;
};

const saveJson = (data: any, filename: string) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", (filename || 'prefab') + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

const loadJson = async () => {
    return new Promise<Prefab | undefined>((resolve) => {
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
                    if (typeof text === 'string') {
                        const json = JSON.parse(text);
                        resolve(json as Prefab);
                    }
                } catch (err) {
                    console.error('Error parsing prefab JSON:', err);
                    resolve(undefined);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
};
export default PrefabEditor;