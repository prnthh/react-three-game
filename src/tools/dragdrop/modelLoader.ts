import type { Object3D, Texture } from "three";
import { SRGBColorSpace, TextureLoader } from "three";
import { DRACOLoader, FBXLoader, GLTFLoader } from "three/examples/jsm/Addons.js";

export type LoadedModel = Object3D;
export type LoadedTexture = Texture;

export type ModelLoadResult = {
    success: boolean;
    model?: LoadedModel;
    error?: unknown;
};

export type TextureLoadResult = {
    success: boolean;
    texture?: LoadedTexture;
    error?: unknown;
};

export type ProgressCallback = (filename: string, loaded: number, total: number) => void;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const fbxLoader = new FBXLoader();
const textureLoader = new TextureLoader();

type ModelFileKind = "gltf" | "fbx";
const TEXTURE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"] as const;

function normalizeModelPath(name: string) {
    return name.split(/[?#]/, 1)[0].toLowerCase();
}

function getModelFileKind(name: string): ModelFileKind | null {
    const normalizedName = normalizeModelPath(name);

    if (normalizedName.endsWith(".glb") || normalizedName.endsWith(".gltf")) {
        return "gltf";
    }

    if (normalizedName.endsWith(".fbx")) {
        return "fbx";
    }

    return null;
}

export function canParseModelFile(file: File | string) {
    const filename = typeof file === "string" ? file : file.name;
    return getModelFileKind(filename) !== null;
}

export function canParseTextureFile(file: File | string) {
    const filename = typeof file === "string" ? file : file.name;
    const normalizedName = normalizeModelPath(filename);

    return TEXTURE_FILE_EXTENSIONS.some(extension => normalizedName.endsWith(extension));
}

function parseModelBuffer(arrayBuffer: ArrayBuffer, sourceName: string): Promise<ModelLoadResult> {
    const modelFileKind = getModelFileKind(sourceName);

    if (modelFileKind === "gltf") {
        return new Promise(resolve => {
            gltfLoader.parse(
                arrayBuffer,
                "",
                gltf => {
                    resolve({ success: true, model: gltf.scene });
                },
                error => {
                    resolve({ success: false, error });
                },
            );
        });
    }

    if (modelFileKind === "fbx") {
        try {
            const model = fbxLoader.parse(arrayBuffer, "");
            return Promise.resolve({ success: true, model });
        } catch (error) {
            return Promise.resolve({ success: false, error });
        }
    }

    return Promise.resolve({ success: false, error: new Error(`Unsupported file format: ${sourceName}`) });
}

export function parseModelFromFile(file: File): Promise<ModelLoadResult> {
    return new Promise(resolve => {
        const reader = new FileReader();

        reader.onload = event => {
            const arrayBuffer = event.target?.result as ArrayBuffer;

            if (!arrayBuffer) {
                resolve({ success: false, error: new Error("Failed to read file") });
                return;
            }

            void parseModelBuffer(arrayBuffer, file.name).then(resolve);
        };

        reader.onerror = () => resolve({ success: false, error: reader.error });
        reader.readAsArrayBuffer(file);
    });
}

export function parseTextureFromFile(file: File): Promise<TextureLoadResult> {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);

        textureLoader.load(
            url,
            texture => {
                texture.colorSpace = SRGBColorSpace;
                resolve({ success: true, texture });
                URL.revokeObjectURL(url);
            },
            undefined,
            error => {
                resolve({ success: false, error });
                URL.revokeObjectURL(url);
            },
        );
    });
}

export async function loadModel(
    filename: string,
    onProgress?: ProgressCallback,
): Promise<ModelLoadResult> {
    try {
        const fullPath = filename;
        const modelFileKind = getModelFileKind(filename);

        if (modelFileKind === "gltf") {
            return new Promise(resolve => {
                gltfLoader.load(
                    fullPath,
                    gltf => resolve({ success: true, model: gltf.scene }),
                    progressEvent => {
                        if (!onProgress) {
                            return;
                        }

                        const total = progressEvent.total || progressEvent.loaded;
                        onProgress(filename, progressEvent.loaded, total);
                    },
                    error => resolve({ success: false, error }),
                );
            });
        }

        if (modelFileKind === "fbx") {
            return new Promise(resolve => {
                fbxLoader.load(
                    fullPath,
                    model => resolve({ success: true, model }),
                    progressEvent => {
                        if (!onProgress) {
                            return;
                        }

                        const total = progressEvent.total || progressEvent.loaded;
                        onProgress(filename, progressEvent.loaded, total);
                    },
                    error => resolve({ success: false, error }),
                );
            });
        }

        return { success: false, error: new Error(`Unsupported file format: ${filename}`) };
    } catch (error) {
        return { success: false, error };
    }
}

export async function loadTexture(filename: string): Promise<TextureLoadResult> {
    try {
        if (!canParseTextureFile(filename)) {
            return { success: false, error: new Error(`Unsupported file format: ${filename}`) };
        }

        return await new Promise(resolve => {
            textureLoader.load(
                filename,
                texture => {
                    texture.colorSpace = SRGBColorSpace;
                    resolve({ success: true, texture });
                },
                undefined,
                error => resolve({ success: false, error }),
            );
        });
    } catch (error) {
        return { success: false, error };
    }
}
