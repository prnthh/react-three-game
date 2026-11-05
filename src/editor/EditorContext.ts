import type { PrefabDocumentApi } from '../core/prefabDocumentApi.js';
import { createContext, useContext } from "react";
import type { PrefabApi, Scene } from "../runtime/scene/SceneContext.js";
import type { Prefab } from "../core/types.js";

import type { SceneAgent } from "./agent/sceneAgent.js";

export interface PrefabEditorRef extends Scene, PrefabApi, PrefabDocumentApi {
    scene: SceneAgent;
    /** Open a document and start a fresh undo history. */
    load: (prefab: Prefab) => void;
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
