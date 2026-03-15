import { GLTFLoader, FBXLoader, DRACOLoader } from "three/examples/jsm/Addons.js";

export type ModelLoadResult = {
    success: boolean;
    model?: any;
    error?: any;
};

export type ProgressCallback = (filename: string, loaded: number, total: number) => void;

// Singleton loader instances
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const fbxLoader = new FBXLoader();

/**
 * Parse a model from a File object (e.g. from drag-drop or file picker).
 * Returns the parsed Three.js Object3D scene.
 */
export function parseModelFromFile(file: File): Promise<ModelLoadResult> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
                resolve({ success: false, error: new Error('Failed to read file') });
                return;
            }
            const name = file.name.toLowerCase();
            if (name.endsWith('.glb') || name.endsWith('.gltf')) {
                gltfLoader.parse(arrayBuffer, '', (gltf) => {
                    resolve({ success: true, model: gltf.scene });
                }, (error) => {
                    resolve({ success: false, error });
                });
            } else if (name.endsWith('.fbx')) {
                try {
                    const model = fbxLoader.parse(arrayBuffer, '');
                    resolve({ success: true, model });
                } catch (error) {
                    resolve({ success: false, error });
                }
            } else {
                resolve({ success: false, error: new Error(`Unsupported file format: ${file.name}`) });
            }
        };
        reader.onerror = () => resolve({ success: false, error: reader.error });
        reader.readAsArrayBuffer(file);
    });
}

export async function loadModel(
    filename: string,
    onProgress?: ProgressCallback
): Promise<ModelLoadResult> {
    try {
        // Use filename directly (should already include leading /)
        const fullPath = filename;

        if (filename.endsWith('.glb') || filename.endsWith('.gltf')) {
            return new Promise((resolve) => {
                gltfLoader.load(
                    fullPath,
                    (gltf) => resolve({ success: true, model: gltf.scene }),
                    (progressEvent) => {
                        if (onProgress) {
                            // Use loaded as total if total is not available
                            const total = progressEvent.total || progressEvent.loaded;
                            onProgress(filename, progressEvent.loaded, total);
                        }
                    },
                    (error) => resolve({ success: false, error })
                );
            });
        } else if (filename.endsWith('.fbx')) {
            return new Promise((resolve) => {
                fbxLoader.load(
                    fullPath,
                    (model) => resolve({ success: true, model }),
                    (progressEvent) => {
                        if (onProgress) {
                            // Use loaded as total if total is not available
                            const total = progressEvent.total || progressEvent.loaded;
                            onProgress(filename, progressEvent.loaded, total);
                        }
                    },
                    (error) => resolve({ success: false, error })
                );
            });
        } else {
            return { success: false, error: new Error(`Unsupported file format: ${filename}`) };
        }
    } catch (error) {
        return { success: false, error };
    }
}
