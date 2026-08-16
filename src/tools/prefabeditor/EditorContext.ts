import { createContext, useContext } from "react";
import type { PrefabApi, Scene } from "./SceneContext";
import type { Prefab } from "./types";
import type { ExportGLBOptions } from "./utils";

export interface PrefabEditorRef extends Scene, PrefabApi {
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
