import { createContext, useContext } from "react";

interface EditorContextType {
    transformMode: "translate" | "rotate" | "scale";
    setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
    snapResolution: number;
    setSnapResolution: (resolution: number) => void;
    onScreenshot?: () => void;
    onExportGLB?: () => void;
}

export const EditorContext = createContext<EditorContextType | null>(null);

export function useEditorContext() {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error("useEditorContext must be used within EditorContext.Provider");
    }
    return context;
}
