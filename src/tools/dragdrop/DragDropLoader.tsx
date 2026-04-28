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

function getStringFromItem(item: DataTransferItem) {
    return new Promise<string>(resolve => item.getAsString(value => resolve(value ?? "")));
}

function parseUriList(value: string) {
    return value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"));
}

function parseDroppedUrls(value: string) {
    const urls = new Set<string>();
    const addUrl = (candidate: string) => {
        try {
            const url = new URL(candidate.trim());
            if (url.protocol === "http:" || url.protocol === "https:") {
                urls.add(url.href);
            }
        } catch {
            // Ignore non-URL dropped text.
        }
    };

    parseUriList(value).forEach(addUrl);

    if (typeof DOMParser !== "undefined" && value.includes("<")) {
        const document = new DOMParser().parseFromString(value, "text/html");
        document.querySelectorAll("[href], [src]").forEach(element => {
            const rawUrl = element.getAttribute("href") ?? element.getAttribute("src");
            if (rawUrl) addUrl(rawUrl);
        });
    }

    return Array.from(urls);
}

async function getDroppedUrls(dataTransfer?: DataTransfer | null) {
    if (!dataTransfer) return [];

    const urls = new Set<string>();
    const itemValues = await Promise.all(
        Array.from(dataTransfer.items ?? [])
            .filter(item => item.kind === "string")
            .map(getStringFromItem),
    );

    itemValues.forEach(value => parseDroppedUrls(value).forEach(url => urls.add(url)));

    const uriList = dataTransfer.getData("text/uri-list");
    const plainText = dataTransfer.getData("text/plain");
    const html = dataTransfer.getData("text/html");

    [uriList, plainText, html].forEach(value => {
        if (value) parseDroppedUrls(value).forEach(url => urls.add(url));
    });

    return Array.from(urls);
}

function getExtensionFromMimeType(mimeType: string) {
    const type = mimeType.split(";", 1)[0].toLowerCase();
    const extensions: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/bmp": ".bmp",
        "image/svg+xml": ".svg",
        "model/gltf-binary": ".glb",
        "model/gltf+json": ".gltf",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
    };

    return extensions[type] ?? "";
}

function getFilenameFromUrl(url: string, mimeType: string) {
    const parsedUrl = new URL(url);
    const rawName = parsedUrl.pathname.split("/").filter(Boolean).pop() || "asset";
    const decodedName = decodeURIComponent(rawName).replace(/[^\w.\-]+/g, "-");
    const hasExtension = /\.[a-z0-9]+$/i.test(decodedName);
    return hasExtension ? decodedName : `${decodedName}${getExtensionFromMimeType(mimeType)}`;
}

async function fetchUrlAsFile(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    return new File([blob], getFilenameFromUrl(url, blob.type), { type: blob.type });
}

export async function loadDroppedAssets(dataTransfer: DataTransfer | null, options: AssetLoadOptions) {
    const localFiles = getFiles(dataTransfer?.files);
    const remoteUrls = await getDroppedUrls(dataTransfer);
    const localNames = new Set(localFiles.map(file => file.name));

    await Promise.all(remoteUrls.map(async url => {
        try {
            const file = await fetchUrlAsFile(url);
            if (!localNames.has(file.name)) {
                await loadFile(file, options, url);
            }
        } catch (error) {
            const fallbackName = getFilenameFromUrl(url, "");
            const fallbackFile = new File([], fallbackName);
            await options.onLoadError?.(error, url, fallbackFile);
            if (!options.onLoadError) {
                console.error("URL load error:", error);
            }
        }
    }));

    await loadFiles(localFiles, options);
}

export async function loadUrls(urls: string[], options: AssetLoadOptions) {
    await Promise.all(urls.map(url => loadUrl(url, options)));
}

export async function loadUrl(url: string, options: AssetLoadOptions) {
    try {
        const file = await fetchUrlAsFile(url);
        await loadFile(file, options, url);
    } catch (error) {
        const fallbackName = getFilenameFromUrl(url, "");
        const fallbackFile = new File([], fallbackName);
        await options.onLoadError?.(error, url, fallbackFile);
        if (!options.onLoadError) {
            console.error("URL load error:", error);
        }
    }
}

export async function loadFiles(
    files: File[],
    { onModelLoaded, onTextureLoaded, onSoundLoaded, onUnhandledFile, onFilesLoaded, onLoadError }: AssetLoadOptions,
) {
    await Promise.all(
        files.map(file => loadFile(file, { onModelLoaded, onTextureLoaded, onSoundLoaded, onUnhandledFile, onLoadError })),
    );

    await onFilesLoaded?.(files);
}

async function loadFile(
    file: File,
    { onModelLoaded, onTextureLoaded, onSoundLoaded, onUnhandledFile, onLoadError }: AssetLoadOptions,
    assetRef = file.name,
) {
    const shouldParseModel = canParseModelFile(file);
    const shouldParseTexture = canParseTextureFile(file);
    const shouldParseSound = canParseSoundFile(file);

    if (shouldParseModel) {
        const result = await parseModelFromFile(file);

        if (result.success && result.model) {
            await onModelLoaded?.(result.model, assetRef, file);
            return;
        }

        if (onLoadError) {
            await onLoadError(result.error, assetRef, file);
            return;
        }

        console.error("Model parse error:", result.error);
        return;
    }

    if (shouldParseTexture) {
        const result = await parseTextureFromFile(file);

        if (result.success && result.texture) {
            await onTextureLoaded?.(result.texture, assetRef, file);
            return;
        }

        if (onLoadError) {
            await onLoadError(result.error, assetRef, file);
            return;
        }

        console.error("Texture parse error:", result.error);
        return;
    }

    if (shouldParseSound) {
        const result = await parseSoundFromFile(file);

        if (result.success && result.sound) {
            await onSoundLoaded?.(result.sound, assetRef, file);
            return;
        }

        if (onLoadError) {
            await onLoadError(result.error, assetRef, file);
            return;
        }

        console.error("Sound parse error:", result.error);
        return;
    }

    if (onUnhandledFile) {
        await onUnhandledFile(file);
    }
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

        void loadDroppedAssets(event.dataTransfer, loadOptions).catch(reportFileLoadError);
    }

    function handleDragOver(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        event.stopPropagation();
    }

    return (
        <div role="application" {...divProps} onDrop={handleDrop} onDragOver={handleDragOver}>
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
