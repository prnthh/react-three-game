"use client";

import GameCanvas from "../../shared/GameCanvas";
import { useState, useRef, useEffect } from "react";
import { Group, } from "three";
import { Prefab, } from "./types";
import PrefabRoot from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
import EditorUI from "./EditorUI";

const PrefabEditor = ({ basePath, initialPrefab, onPrefabChange, children }: { basePath?: string, initialPrefab?: Prefab, onPrefabChange?: (prefab: Prefab) => void, children?: React.ReactNode }) => {
    const [editMode, setEditMode] = useState(true);
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab>(initialPrefab ?? {
        "id": "prefab-default",
        "name": "New Prefab",
        "root": {
            "id": "root",
            "components": {
                "transform": {
                    "type": "Transform",
                    "properties": {
                        "position": [0, 0, 0],
                        "rotation": [0, 0, 0],
                        "scale": [1, 1, 1]
                    }
                }
            }
        }
    });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const prefabRef = useRef<Group>(null);

    // Sync internal state with external initialPrefab prop
    useEffect(() => {
        if (initialPrefab) {
            setLoadedPrefab(initialPrefab);
        }
    }, [initialPrefab]);

    // Wrapper to update prefab and notify parent
    const updatePrefab = (newPrefab: Prefab | ((prev: Prefab) => Prefab)) => {
        setLoadedPrefab(prevPrefab => {
            const resolved = typeof newPrefab === 'function' ? newPrefab(prevPrefab) : newPrefab;
            onPrefabChange?.(resolved);
            return resolved;
        });
    };

    return <>
        <GameCanvas>
            <Physics paused={editMode}>
                <ambientLight intensity={1.5} />
                <gridHelper args={[10, 10]} position={[0, -1, 0]} />
                <PrefabRoot
                    data={loadedPrefab}
                    ref={prefabRef}

                    // props for edit mode
                    editMode={editMode}
                    onPrefabChange={updatePrefab}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    transformMode={transformMode}
                    setTransformMode={setTransformMode}
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
    const [historyState, setHistoryState] = useState({
        states: [currentData],
        index: 0,
    });
    const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedDataRef = useRef<string>(JSON.stringify(currentData));

    const handleUndo = () => {
        setHistoryState(prev => {
            if (prev.index > 0) {
                const newIndex = prev.index - 1;
                lastSavedDataRef.current = JSON.stringify(prev.states[newIndex]);
                onDataChange(prev.states[newIndex]);
                return { ...prev, index: newIndex };
            }
            return prev;
        });
    };

    const handleRedo = () => {
        setHistoryState(prev => {
            if (prev.index < prev.states.length - 1) {
                const newIndex = prev.index + 1;
                lastSavedDataRef.current = JSON.stringify(prev.states[newIndex]);
                onDataChange(prev.states[newIndex]);
                return { ...prev, index: newIndex };
            }
            return prev;
        });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const currentDataStr = JSON.stringify(currentData);
        if (currentDataStr === lastSavedDataRef.current) {
            return;
        }

        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
        }

        throttleTimeoutRef.current = setTimeout(() => {
            lastSavedDataRef.current = currentDataStr;
            setHistoryState(prev => {
                const newStates = prev.states.slice(0, prev.index + 1);
                newStates.push(currentData);
                if (newStates.length > 50) {
                    newStates.shift();
                }
                return {
                    states: newStates,
                    index: newStates.length - 1,
                };
            });
        }, 500);

        return () => {
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current);
            }
        };
    }, [currentData]);

    const handleLoad = async () => {
        const prefab = await loadJson();
        if (prefab) {
            onDataChange(prefab);
            setHistoryState({ states: [prefab], index: 0 });
            lastSavedDataRef.current = JSON.stringify(prefab);
        }
    };

    const canUndo = historyState.index > 0;
    const canRedo = historyState.index < historyState.states.length - 1;

    return <div style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 4px",
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 4,
        color: "rgba(255,255,255,0.9)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 11,
        lineHeight: 1,
        WebkitUserSelect: "none",
        userSelect: "none",
    }}>
        <PanelButton onClick={() => onEditModeChange(!editMode)}>
            {editMode ? "▶" : "⏸"}
        </PanelButton>

        <span style={{ opacity: 0.35 }}>|</span>

        <PanelButton onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶
        </PanelButton>

        <PanelButton onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            ↷
        </PanelButton>

        <span style={{ opacity: 0.35 }}>|</span>

        <PanelButton onClick={handleLoad} title="Load JSON">
            📥
        </PanelButton>

        <PanelButton onClick={() => saveJson(currentData, "prefab")} title="Save JSON">
            💾
        </PanelButton>
    </div>;
};

const PanelButton = ({
    onClick,
    disabled,
    title,
    children
}: {
    onClick: () => void;
    disabled?: boolean;
    title?: string;
    children: React.ReactNode;
}) => {
    return <button
        style={{
            padding: "2px 6px",
            font: "inherit",
            background: "transparent",
            color: disabled ? "rgba(255,255,255,0.3)" : "inherit",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 3,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
        }}
        onClick={onClick}
        disabled={disabled}
        title={title}
        onPointerEnter={(e) => {
            if (!disabled) {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
            }
        }}
        onPointerLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
    >
        {children}
    </button>;
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