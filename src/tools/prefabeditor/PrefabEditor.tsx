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

        <div style={{ position: "absolute", top: "0.5rem", left: "50%", transform: "translateX(-50%)" }} className="bg-black/70 backdrop-blur-sm border border-cyan-500/30 px-2 py-1 flex items-center gap-1">
            <button
                className="px-1 py-0.5 text-[10px] font-mono text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30"
                onClick={() => setEditMode(!editMode)}
            >
                {editMode ? "▶" : "⏸"}
            </button>
            <span className="text-cyan-500/30 text-[10px]">|</span>
            <button
                className="px-1 py-0.5 text-[10px] font-mono text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30"
                onClick={async () => {
                    const prefab = await loadJson();
                    if (prefab) setLoadedPrefab(prefab);
                }}
            >
                📥
            </button>
            <button
                className="px-1 py-0.5 text-[10px] font-mono text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30"
                onClick={() => saveJson(loadedPrefab, "prefab")}
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