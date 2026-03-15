// DragDropLoader.tsx
import { useEffect, ChangeEvent } from "react";
import { parseModelFromFile } from "./modelLoader";

interface DragDropLoaderProps {
    onModelLoaded: (model: any, filename: string) => void;
}

function handleFiles(files: File[], onModelLoaded: (model: any, filename: string) => void) {
    files.forEach(async (file) => {
        const result = await parseModelFromFile(file);
        if (result.success && result.model) {
            onModelLoaded(result.model, file.name);
        } else {
            console.error("Model parse error:", result.error);
        }
    });
}

export function DragDropLoader({ onModelLoaded }: DragDropLoaderProps) {
    useEffect(() => {
        function handleDrop(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();
            const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
            handleFiles(files, onModelLoaded);
        }
        function handleDragOver(e: DragEvent) {
            e.preventDefault();
            e.stopPropagation();
        }
        window.addEventListener("drop", handleDrop);
        window.addEventListener("dragover", handleDragOver);
        return () => {
            window.removeEventListener("drop", handleDrop);
            window.removeEventListener("dragover", handleDragOver);
        };
    }, [onModelLoaded]);
    return null;
}

// FilePicker component
interface FilePickerProps {
    onModelLoaded: (model: any, filename: string) => void;
}

export function FilePicker({ onModelLoaded }: FilePickerProps) {
    function onChange(e: ChangeEvent<HTMLInputElement>) {
        const files = e.target.files ? Array.from(e.target.files) : [];
        handleFiles(files, onModelLoaded);
    }
    // Ref for the hidden input
    const inputId = "file-picker-input";
    return (
        <>
            <input
                id={inputId}
                type="file"
                accept=".glb,.gltf,.fbx"
                multiple
                onChange={onChange}
                className="hidden"
            />
            <button
                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 hover:border-blue-400/60 text-blue-200 hover:text-blue-100 text-xs font-medium transition-all"
                type="button"
                onClick={() => document.getElementById(inputId)?.click()}
            >
                Select Files
            </button>
        </>
    );
}
