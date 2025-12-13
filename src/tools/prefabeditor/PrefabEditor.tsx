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

        <div
            style={{
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
            }}
        >
            <button
                style={{
                    padding: "2px 6px",
                    font: "inherit",
                    background: "transparent",
                    color: "inherit",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 3,
                    cursor: "pointer",
                }}
                onClick={() => setEditMode(!editMode)}
                onPointerEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                }}
                onPointerLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
            >
                {editMode ? "▶" : "⏸"}
            </button>
            <span style={{ opacity: 0.35 }}>|</span>
            <button
                style={{
                    padding: "2px 6px",
                    font: "inherit",
                    background: "transparent",
                    color: "inherit",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 3,
                    cursor: "pointer",
                }}
                onClick={async () => {
                    const prefab = await loadJson();
                    if (prefab) setLoadedPrefab(prefab);
                }}
                onPointerEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                }}
                onPointerLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
            >
                📥
            </button>
            <button
                style={{
                    padding: "2px 6px",
                    font: "inherit",
                    background: "transparent",
                    color: "inherit",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 3,
                    cursor: "pointer",
                }}
                onClick={() => saveJson(loadedPrefab, "prefab")}
                onPointerEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                }}
                onPointerLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
            >
                💾
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
        />}
    </>
}

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