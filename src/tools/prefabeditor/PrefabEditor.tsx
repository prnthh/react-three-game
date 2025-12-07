"use client";

import GameCanvas from "../../shared/GameCanvas";
import { useState, useRef, } from "react";
import { Group, } from "three";
import { Prefab, } from "./types";
import PrefabRoot from "./PrefabRoot";
import { Physics } from "@react-three/rapier";
// import testPrefab from "./samples/test.json";
import EditorUI from "./EditorUI";

const PrefabEditor = ({ children }: { children?: React.ReactNode }) => {
    const [editMode, setEditMode] = useState(true);
    const [loadedPrefab, setLoadedPrefab] = useState<Prefab>({
        "id": "root",
        "name": "Root",
        "type": "Group",
    } as unknown as Prefab);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
    const prefabRef = useRef<Group>(null);

    return <><GameCanvas>
        <Physics paused={editMode}>
            <ambientLight intensity={1.5} />
            <gridHelper args={[10, 10]} position={[0, -1, 0]} />
            <PrefabRoot
                data={loadedPrefab}
                ref={prefabRef}

                // props for edit mode
                editMode={editMode}
                onPrefabChange={setLoadedPrefab}
                selectedId={selectedId}
                onSelect={setSelectedId}
                transformMode={transformMode}
                setTransformMode={setTransformMode}
            />
            {children}
        </Physics>

    </GameCanvas>

        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm border border-cyan-500/30 px-2 py-1 flex items-center gap-1">
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
            setPrefabData={setLoadedPrefab}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            transformMode={transformMode}
            setTransformMode={setTransformMode}
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