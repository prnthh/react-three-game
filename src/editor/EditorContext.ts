import { createContext, useContext } from "react";
import type { PrefabApi, Scene, PrefabEditorMode } from "../runtime/scene/SceneContext.js";
import type { Prefab } from "../core/types.js";
import type { ExportGLBOptions } from "./documentIO.js";

import type { SceneAgent } from "./agent/sceneAgent.js";

export interface PrefabEditorRef extends Scene, PrefabApi {
    scene: SceneAgent;
    setMode: (mode: PrefabEditorMode) => void;
    resetScene: () => Promise<void>;
    save: () => Prefab;
    load: (prefab: Prefab) => void;
    undo: () => void;
    redo: () => void;
    screenshot: () => void;
    exportGLB: (options?: ExportGLBOptions) => Promise<ArrayBuffer | undefined>;
    exportGLBData: () => Promise<ArrayBuffer | undefined>;
    clearSelection: () => Promise<void>;
}

export interface EditorContextType {
    createPrefab?: () => Prefab;
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
    scaleSnap: number;
    setScaleSnap: (resolution: number) => void;
    positionSnap: number;
    setPositionSnap: (resolution: number) => void;
    rotationSnap: number;
    setRotationSnap: (resolution: number) => void;
    onFocusNode?: (nodeId: string) => void;
}

export const EditorContext = createContext<EditorContextType | null>(null);
export const EditorRefContext = createContext<PrefabEditorRef | null>(null);

export function useEditorContext() {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error("useEditorContext must be used within EditorContext.Provider");
    }
    return context;
}

export function useEditorRef() {
    const editorRef = useContext(EditorRefContext);
    if (!editorRef) {
        throw new Error("useEditorRef must be used within PrefabEditor");
    }
    return editorRef;
}
