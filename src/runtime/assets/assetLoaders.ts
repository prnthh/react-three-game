import type { Object3D, Texture } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SRGBColorSpace, TextureLoader } from "three";

export type ProgressCallback = (filename: string, loaded: number, total: number) => void;

// Geometry-only scenes should not download or initialize model codecs.
let gltfLoaderPromise: Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader> | undefined;
function getGLTFLoader() {
    return gltfLoaderPromise ??= Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
    ]).then(([{ GLTFLoader }, { DRACOLoader }]) => {
        const decoder = new DRACOLoader();
        decoder.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        return new GLTFLoader().setDRACOLoader(decoder);
    }).catch(error => { gltfLoaderPromise = undefined; throw error; });
}
let fbxLoaderPromise: Promise<import('three/examples/jsm/loaders/FBXLoader.js').FBXLoader> | undefined;
function getFBXLoader() {
    return fbxLoaderPromise ??= import('three/examples/jsm/loaders/FBXLoader.js')
        .then(({ FBXLoader }) => new FBXLoader())
        .catch(error => { fbxLoaderPromise = undefined; throw error; });
}
const textureLoader = new TextureLoader();

type ModelFileKind = "gltf" | "fbx";
const TEXTURE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"] as const;
const SOUND_FILE_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a"] as const;

let decodeAudioContext: AudioContext | null = null;

function getAudioContext() {
    if (typeof window === 'undefined') {
        throw new Error('Audio loading is only supported in the browser');
    }

    if (!decodeAudioContext) {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) {
            throw new Error('Web Audio API is not available in this browser');
        }

        decodeAudioContext = new AudioCtx();
    }

    return decodeAudioContext;
}

function normalizeModelPath(name: string) {
    return name.split(/[?#]/, 1)[0].toLowerCase();
}

function normalizeManifestPath(path: string) {
    try {
        path = new URL(path, "http://asset.local").pathname;
    } catch {
        // A filename is also a valid lookup hint.
    }
    try {
        path = decodeURIComponent(path);
    } catch {
        // Keep malformed URI text usable as a literal filename.
    }
    return normalizeModelPath(path).replace(/\\/g, "/");
}

/** Resolve an authored manifest path without guessing between duplicate names. */
export function resolveManifestAssetPath(files: string[], hint: string) {
    const normalizedHint = normalizeManifestPath(hint);
    for (let index = 0; index < files.length; index += 1) {
        if (normalizeManifestPath(files[index]) === normalizedHint) return files[index];
    }

    const basename = normalizedHint.slice(normalizedHint.lastIndexOf("/") + 1);
    let match: string | null = null;
    for (let index = 0; index < files.length; index += 1) {
        const candidate = normalizeManifestPath(files[index]);
        if (candidate.slice(candidate.lastIndexOf("/") + 1) !== basename) continue;
        if (match) return null;
        match = files[index];
    }
    return match;
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
    if (filename.startsWith("data:image/")) return true;

    const normalizedName = normalizeModelPath(filename);

    return TEXTURE_FILE_EXTENSIONS.some(extension => normalizedName.endsWith(extension));
}

export function canParseSoundFile(file: File | string) {
    const filename = typeof file === "string" ? file : file.name;
    const normalizedName = normalizeModelPath(filename);

    return SOUND_FILE_EXTENSIONS.some(extension => normalizedName.endsWith(extension));
}

async function parseModelBuffer(arrayBuffer: ArrayBuffer, sourceName: string): Promise<Object3D> {
    const kind = getModelFileKind(sourceName);
    if (kind === 'gltf') {
        const gltf = await (await getGLTFLoader()).parseAsync(arrayBuffer, '');
        gltf.scene.animations = gltf.animations;
        return gltf.scene;
    }
    if (kind === 'fbx') return (await getFBXLoader()).parse(arrayBuffer, '');
    throw new Error(`Unsupported file format: ${sourceName}`);
}

export async function parseModelFromFile(file: File): Promise<Object3D> {
    return parseModelBuffer(await file.arrayBuffer(), file.name);
}

export async function parseTextureFromFile(file: File): Promise<Texture> {
    const url = URL.createObjectURL(file);
    try {
        const texture = await textureLoader.loadAsync(url);
        texture.colorSpace = SRGBColorSpace;
        return texture;
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function parseSoundFromFile(file: File): Promise<AudioBuffer> {
    const bytes = await file.arrayBuffer();
    return getAudioContext().decodeAudioData(bytes.slice(0));
}

/** Load an asset directly; failures reject with the loader's original error. */
export async function loadModel(filename: string, onProgress?: ProgressCallback): Promise<Object3D> {
    const kind = getModelFileKind(filename);
    if (!kind) throw new Error(`Unsupported file format: ${filename}`);
    const loader = kind === 'gltf' ? await getGLTFLoader() : await getFBXLoader();
    const result = await loader.loadAsync(filename,
        progress => onProgress?.(filename, progress.loaded, progress.total || progress.loaded));
    if (kind === 'gltf') {
        const gltf = result as GLTF;
        gltf.scene.animations = gltf.animations;
        return gltf.scene;
    }
    return result as Object3D;
}

export async function loadTexture(filename: string): Promise<Texture> {
    if (!canParseTextureFile(filename)) throw new Error(`Unsupported file format: ${filename}`);
    const texture = await textureLoader.loadAsync(filename);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

export async function loadSound(filename: string): Promise<AudioBuffer> {
    if (!canParseSoundFile(filename)) throw new Error(`Unsupported file format: ${filename}`);
    const response = await fetch(filename);
    const arrayBuffer = await response.arrayBuffer();
    return getAudioContext().decodeAudioData(arrayBuffer.slice(0));
}
