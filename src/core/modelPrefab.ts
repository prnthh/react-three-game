import type { GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
    BackSide,
    BufferAttribute,
    DoubleSide,
    Material,
    Mesh,
    Object3D,
} from 'three';
import type { BufferGeometry, Texture } from 'three';
import type { ComponentData, GameObject, MaterialComponentProperties, PrefabMaterial, Prefab } from './types.js';

export interface DecomposeModelOptions {
    /** Prefix used for generated prefab node ids. Defaults to "model". */
    idPrefix?: string;
    /** Include invisible Three objects in the generated prefab tree. */
    includeInvisible?: boolean;
    /** Optional game/plugin mapping applied to each converted node. */
    mapNode?: (node: GameObject, object: Object3D) => GameObject;
    /** Return a serializable texture ref for embedded or externally loaded textures. */
    getTexturePath?: (texture: Texture, usage: 'map' | 'normalMap') => string | null | undefined;
}

function createId(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
}

function toArrayAttribute(attribute: BufferAttribute | undefined, itemSize: number, vertexCount: number) {
    if (!attribute || attribute.itemSize < itemSize) return undefined;

    const values: number[] = [];
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        for (let axis = 0; axis < itemSize; axis += 1) {
            values.push(attribute.getComponent(vertexIndex, axis));
        }
    }
    return values;
}

function serializeGeometry(geometry: BufferGeometry) {
    const position = geometry.getAttribute('position') as BufferAttribute | undefined;
    const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
    const uv = geometry.getAttribute('uv') as BufferAttribute | undefined;
    const vertexCount = position?.count ?? 0;
    const index = geometry.index;
    const indices: number[] = [];
    for (let offset = 0; offset < (index?.count ?? vertexCount); offset += 1) {
        indices.push(index ? index.getX(offset) : offset);
    }

    const positions = toArrayAttribute(position, 3, vertexCount) ?? [];
    const normals = toArrayAttribute(normal, 3, vertexCount) ?? [];
    const uvs = toArrayAttribute(uv, 2, vertexCount) ?? [];
    const groups = geometry.groups.map(group => ({
        start: group.start,
        count: group.count,
        materialIndex: group.materialIndex ?? 0,
    }));

    return {
        positions,
        indices,
        normals,
        uvs,
        groups,
        computeVertexNormals: normals.length === 0,
    };
}


function getSideName(side: Material['side']) {
    if (side === BackSide) return 'BackSide';
    if (side === DoubleSide) return 'DoubleSide';
    return 'FrontSide';
}

function getTextureImagePath(texture: Texture | null | undefined) {
    const image = texture?.image as { currentSrc?: unknown; src?: unknown; width?: unknown; height?: unknown } | undefined;
    const path = image?.currentSrc ?? image?.src;

    if (typeof path === 'string' && path.trim() && !path.startsWith('blob:')) {
        return path;
    }

    return undefined;
}

function getTexturePath(texture: Texture | null | undefined, usage: 'map' | 'normalMap', options: Required<DecomposeModelOptions>) {
    if (!texture) return undefined;
    return getTextureImagePath(texture) ?? options.getTexturePath(texture, usage) ?? undefined;
}

function serializeMaterial(material: Material, options: Required<DecomposeModelOptions>): PrefabMaterial {
    const source = material as Material & {
        color?: { getStyle?: () => string };
        map?: Texture | null;
        metalness?: number;
        normalMap?: Texture | null;
        normalScale?: { toArray?: () => number[] };
        roughness?: number;
        wireframe?: boolean;
        toneMapped?: boolean;
    };

    const materialType = 'metalness' in source || 'roughness' in source ? 'standard' : 'basic';
    const texture = getTexturePath(source.map, 'map', options);
    const normalMapTexture = getTexturePath(source.normalMap, 'normalMap', options);
    const normalScale = source.normalScale?.toArray?.();

    return {
        name: material.name || undefined,
        materialType,
        color: source.color?.getStyle?.() ?? '#ffffff',
        ...(texture ? { texture } : null),
        ...(normalMapTexture ? { normalMapTexture } : null),
        ...(normalScale ? { normalScale: normalScale as [number, number] } : null),
        opacity: material.opacity,
        transparent: material.transparent,
        side: getSideName(material.side),
        wireframe: source.wireframe ?? false,
        toneMapped: source.toneMapped ?? true,
        ...(materialType === 'standard' ? {
            metalness: source.metalness ?? 0,
            roughness: source.roughness ?? 1,
        } : null),
    };
}

function createTransformComponent(object: Object3D): ComponentData {
    return {
        type: 'Transform',
        properties: {
            position: object.position.toArray(),
            rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
            scale: object.scale.toArray(),
        },
    };
}

function createNode(
    object: Object3D,
    idPrefix: string,
    children: GameObject[] = [],
    components: Record<string, ComponentData> = {},
    options: { name?: string; hidden?: boolean } = {},
): GameObject {
    return {
        id: createId(idPrefix),
        name: (options.name ?? object.name) || object.type,
        hidden: options.hidden ?? (object.visible === false ? true : undefined),
        components: {
            transform: createTransformComponent(object),
            ...components,
        },
        children,
    };
}

function decomposeObject(
    object: Object3D,
    options: Required<DecomposeModelOptions>,
    materials: Map<Material, string>,
): GameObject | null {
    if (!options.includeInvisible && !object.visible) return null;

    const childNodes = object.children
        .map(child => decomposeObject(child, options, materials))
        .filter((child): child is GameObject => child != null);

    if (!(object instanceof Mesh)) {
        return options.mapNode(createNode(object, options.idPrefix, childNodes), object);
    }

    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materialComponents: Record<string, ComponentData> = {};
    meshMaterials.forEach((material, index) => {
        if (!material) return;
        const existing = materials.get(material);
        const materialName = existing ?? createId(`${options.idPrefix}-material`);
        materials.set(material, materialName);
        materialComponents[meshMaterials.length > 1 ? `material_${index}` : 'material'] = {
            type: 'Material',
            properties: {
                ...(!existing ? serializeMaterial(material, options) : {}),
                name: materialName,
                attach: meshMaterials.length > 1 ? `material-${index}` : 'material',
            } satisfies MaterialComponentProperties,
        };
    });

    return options.mapNode(createNode(object, options.idPrefix, childNodes, {
        geometry: {
            type: 'BufferGeometry',
            properties: {
                ...serializeGeometry(object.geometry),
                visible: object.visible,
                castShadow: object.castShadow,
                receiveShadow: object.receiveShadow,
            },
        },
        ...materialComponents,
    }), object);
}

/**
 * Converts a live Three object hierarchy into composable prefab nodes and
 * shared material definitions. Reused Three material objects keep one id.
 */
export interface DecomposedPrefabNodes {
    root: GameObject;
}

export function decomposeModelToPrefabNodes(
    object: Object3D,
    options: DecomposeModelOptions = {},
): DecomposedPrefabNodes {
    const resolvedOptions = {
        idPrefix: options.idPrefix ?? 'model',
        includeInvisible: options.includeInvisible ?? false,
        mapNode: options.mapNode ?? (node => node),
        getTexturePath: options.getTexturePath ?? (() => undefined),
    };
    const materials = new Map<Material, string>();
    const root = decomposeObject(object, resolvedOptions, materials)
        ?? createNode(object, resolvedOptions.idPrefix);
    return { root };
}

/** Standard Three.js GLB serialization, independent of browser downloads. */
export async function exportGLBData(sceneRoot: Object3D, options: Omit<GLTFExporterOptions, 'binary'> = {}): Promise<ArrayBuffer> {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    ensureBlobReader();
    sceneRoot.updateMatrixWorld(true);
    return new GLTFExporter().parseAsync(sceneRoot, { ...options, binary: true }) as Promise<ArrayBuffer>;
}

/** Decode static GLB objects without image decoding or animation playback. */
export async function loadGLBScene(data: ArrayBuffer | ArrayBufferView): Promise<Object3D> {
    // Buffer views may cover only part of an underlying allocation.
    const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer : data;
    if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) {
        throw new Error('Expected a binary glTF (GLB) file');
    }
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    loader.register(parser => ({
        name: 'RTG_static_import',
        beforeRoot() {
            // The lossy conversion preserves base material values, not texture images.
            parser.assignTexture = async () => null;
            parser.json.animations = [];
            return null;
        },
    }));
    return (await loader.parseAsync(bytes, '')).scene;
}

/** Lossy GLB → prefab JSON using the same decomposition as the editor. */
export async function importGLBData(data: ArrayBuffer | ArrayBufferView): Promise<Prefab> {
    const scene = await loadGLBScene(data);
    try { return { name: scene.name || 'Imported GLB', ...decomposeModelToPrefabNodes(scene) }; }
    finally { disposeModelResources([scene]); }
}

/** Release owned static models, disposing shared geometry/materials only once. Textures are not owned here. */
export function disposeModelResources(models: Iterable<Object3D>) {
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
    for (const model of models) model.traverse(object => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
}

/** Three's exporter still uses FileReader for Blob bytes, even without textures.
 * Install only that small compatibility surface when the host does not supply it.
 * It is shared/idempotent so simultaneous exports cannot restore each other's shim.
 */
function ensureBlobReader() {
    if (typeof globalThis.FileReader !== 'undefined') return;
    class BlobReader {
        result: ArrayBuffer | string | null = null;
        error: unknown = null;
        onloadend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsArrayBuffer(blob: Blob) { void this.read(blob, false); }
        readAsDataURL(blob: Blob) { void this.read(blob, true); }
        private async read(blob: Blob, dataURL: boolean) {
            try {
                const bytes = await blob.arrayBuffer();
                if (dataURL) {
                    const chunks: string[] = [];
                    const view = new Uint8Array(bytes);
                    for (let offset = 0; offset < view.length; offset += 8192) {
                        chunks.push(String.fromCharCode(...view.subarray(offset, offset + 8192)));
                    }
                    this.result = `data:${blob.type || 'application/octet-stream'};base64,${btoa(chunks.join(''))}`;
                } else this.result = bytes;
            } catch (error) {
                this.error = error;
                this.onerror?.();
            }
            this.onloadend?.();
        }
    }
    Object.defineProperty(globalThis, 'FileReader', { value: BlobReader, configurable: true, writable: true });
}
