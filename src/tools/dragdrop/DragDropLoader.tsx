import { ChangeEvent, useRef } from "react";
import type { DragEvent, HTMLAttributes, MouseEvent, ReactNode } from "react";
import type { LoadedModel, LoadedSound, LoadedTexture } from "./modelLoader";
import { canParseModelFile, canParseSoundFile, canParseTextureFile, parseModelFromFile, parseSoundFromFile, parseTextureFromFile } from "./modelLoader";

export interface AssetLoadOptions {
    onModelLoaded?: (model: LoadedModel, filename: string, file: File) => void | Promise<void>;
    onTextureLoaded?: (texture: LoadedTexture, filename: string, file: File) => void | Promise<void>;
    onSoundLoaded?: (sound: LoadedSound, filename: string, file: File) => void | Promise<void>;
    onUnhandledFile?: (file: File) => void | Promise<void>;
    onFilesLoaded?: (files: File[]) => void | Promise<void>;
    onLoadError?: (error: unknown, filename: string, file: File) => void | Promise<void>;
}

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onDrop" | "onDragOver">;

export interface DragDropLoaderProps extends AssetLoadOptions, DivProps {
    children?: ReactNode;
}

export interface FilePickerProps extends AssetLoadOptions, DivProps {
    accept?: string;
    children?: ReactNode;
    multiple?: boolean;
}

const DEFAULT_ACCEPT = ".glb,.gltf,.fbx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.mp3,.wav,.ogg,.m4a";

function getFiles(fileList?: FileList | null) {
    return fileList ? Array.from(fileList) : [];
}

export async function loadFiles(
    files: File[],
    { onModelLoaded, onTextureLoaded, onSoundLoaded, onUnhandledFile, onFilesLoaded, onLoadError }: AssetLoadOptions,
) {
    await Promise.all(
        files.map(async (file) => {
            const shouldParseModel = canParseModelFile(file);
            const shouldParseTexture = canParseTextureFile(file);
            const shouldParseSound = canParseSoundFile(file);

            if (shouldParseModel) {
                const result = await parseModelFromFile(file);

                if (result.success && result.model) {
                    await onModelLoaded?.(result.model, file.name, file);
                    return;
                }

                if (onLoadError) {
                    await onLoadError(result.error, file.name, file);
                    return;
                }

                console.error("Model parse error:", result.error);
                return;
            }

            if (shouldParseTexture) {
                const result = await parseTextureFromFile(file);

                if (result.success && result.texture) {
                    await onTextureLoaded?.(result.texture, file.name, file);
                    return;
                }

                if (onLoadError) {
                    await onLoadError(result.error, file.name, file);
                    return;
                }

                console.error("Texture parse error:", result.error);
                return;
            }

            if (shouldParseSound) {
                const result = await parseSoundFromFile(file);

                if (result.success && result.sound) {
                    await onSoundLoaded?.(result.sound, file.name, file);
                    return;
                }

                if (onLoadError) {
                    await onLoadError(result.error, file.name, file);
                    return;
                }

                console.error("Sound parse error:", result.error);
                return;
            }

            if (onUnhandledFile) {
                await onUnhandledFile(file);
            }
        }),
    );

    await onFilesLoaded?.(files);
}

function reportFileLoadError(error: unknown) {
    console.error("File load error:", error);
}

function createLoadHandlers(options: AssetLoadOptions) {
    return {
        onFilesLoaded: options.onFilesLoaded,
        onModelLoaded: options.onModelLoaded,
        onSoundLoaded: options.onSoundLoaded,
        onTextureLoaded: options.onTextureLoaded,
        onUnhandledFile: options.onUnhandledFile,
        onLoadError: options.onLoadError,
    } satisfies AssetLoadOptions;
}

export function DragDropLoader({
    children,
    ...divProps
}: DragDropLoaderProps) {
    const loadOptions = createLoadHandlers(divProps);

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        event.stopPropagation();

        void loadFiles(getFiles(event.dataTransfer?.files), loadOptions).catch(reportFileLoadError);
    }

    function handleDragOver(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        event.stopPropagation();
    }

    return (
        <div {...divProps} onDrop={handleDrop} onDragOver={handleDragOver}>
            {children}
        </div>
    );
}

export function FilePicker({
    accept = DEFAULT_ACCEPT,
    children,
    multiple = true,
    ...divProps
}: FilePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const { onClick, ...wrapperProps } = divProps;
    const loadOptions = createLoadHandlers(divProps);

    function onChange(event: ChangeEvent<HTMLInputElement>) {
        void loadFiles(getFiles(event.target.files), loadOptions).catch(reportFileLoadError);
        event.target.value = "";
    }

    function handleClick(event: MouseEvent<HTMLDivElement>) {
        onClick?.(event);

        if (!event.defaultPrevented) {
            inputRef.current?.click();
        }
    }

    return (
        <div {...wrapperProps} onClick={handleClick}>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                onChange={onChange}
                hidden
            />
            {children ?? "Select Files"}
        </div>
    );
}
