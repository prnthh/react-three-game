import {
    BackSide,
    BufferAttribute,
    DoubleSide,
    FrontSide,
    Material,
    Mesh,
    Object3D,
} from 'three';
import type { BufferGeometry, ColorRepresentation, Texture } from 'three';
import type { ComponentData, GameObject } from './types';

type NumericArray = number[];

export interface DecomposeModelOptions {
    /** Prefix used for generated prefab node ids. Defaults to "model". */
    idPrefix?: string;
    /** Include invisible Three objects in the generated prefab tree. */
    includeInvisible?: boolean;
    /** Return a serializable texture ref for embedded or externally loaded textures. */
    getTexturePath?: (texture: Texture, usage: 'map' | 'normalMap') => string | null | undefined;
}

function createId(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
}

function toArrayAttribute(attribute: BufferAttribute | undefined, itemSize: number, vertexIndices: number[]) {
    if (!attribute || attribute.itemSize < itemSize) return undefined;

    const values: NumericArray = [];
    for (const vertexIndex of vertexIndices) {
        for (let axis = 0; axis < itemSize; axis += 1) {
            values.push(attribute.getComponent(vertexIndex, axis));
        }
    }
    return values;
}

function getSequentialVertexIndices(count: number) {
    return Array.from({ length: count }, (_, index) => index);
}

function serializeGeometry(geometry: BufferGeometry) {
    const position = geometry.getAttribute('position') as BufferAttribute | undefined;
    const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
    const uv = geometry.getAttribute('uv') as BufferAttribute | undefined;
    const vertexIndices = getSequentialVertexIndices(position?.count ?? 0);
    const index = geometry.index;
    const indices: number[] = [];

    if (index) {
        for (let offset = 0; offset < index.count; offset += 1) {
            indices.push(index.getX(offset));
        }
    } else {
        indices.push(...vertexIndices);
    }

    const positions = toArrayAttribute(position, 3, vertexIndices) ?? [];
    const normals = toArrayAttribute(normal, 3, vertexIndices) ?? [];
    const uvs = toArrayAttribute(uv, 2, vertexIndices) ?? [];
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

function getMaterialColor(material: Material) {
    const maybeColor = material as Material & { color?: { getStyle?: () => string } };
    return maybeColor.color?.getStyle?.() as ColorRepresentation | undefined;
}

function getTextureImagePath(texture: Texture | null | undefined) {
    const image = texture?.image as { currentSrc?: unknown; src?: unknown; width?: unknown; height?: unknown } | undefined;
    const path = image?.currentSrc ?? image?.src;

    if (typeof path === 'string' && path.trim() && !path.startsWith('blob:')) {
        return path;
    }

    return getTextureImageDataUrl(image);
}

function getTextureImageDataUrl(image: { width?: unknown; height?: unknown } | undefined) {
    if (
        !image
        || typeof document === 'undefined'
        || typeof image.width !== 'number'
        || typeof image.height !== 'number'
        || image.width <= 0
        || image.height <= 0
    ) {
        return undefined;
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) return undefined;

        context.drawImage(image as CanvasImageSource, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return undefined;
    }
}

function getTexturePath(texture: Texture | null | undefined, usage: 'map' | 'normalMap', options: Required<DecomposeModelOptions>) {
    if (!texture) return undefined;
    return getTextureImagePath(texture) ?? options.getTexturePath(texture, usage) ?? undefined;
}

function serializeMaterial(material: Material, attach: string, options: Required<DecomposeModelOptions>): ComponentData {
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
        type: 'Material',
        properties: {
            attach,
            materialType,
            color: getMaterialColor(material) ?? '#ffffff',
            ...(texture ? { texture } : null),
            ...(normalMapTexture ? { normalMapTexture } : null),
            ...(normalScale ? { normalScale } : null),
            opacity: material.opacity,
            transparent: material.transparent,
            side: getSideName(material.side),
            wireframe: source.wireframe ?? false,
            toneMapped: source.toneMapped ?? true,
            ...(materialType === 'standard' ? {
                metalness: source.metalness ?? 0,
                roughness: source.roughness ?? 1,
            } : null),
        },
    };
}

function getMeshParts(mesh: Mesh) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    return materials.map((material, index) => {
        return {
            key: materials.length > 1 ? `material_${index}` : 'material',
            material,
            attach: materials.length > 1 ? `material-${index}` : 'material',
        };
    }).filter(part => part.material);
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

function createNode(object: Object3D, idPrefix: string, children: GameObject[] = [], components: Record<string, ComponentData> = {}): GameObject {
    return {
        id: createId(idPrefix),
        name: object.name || object.type,
        hidden: object.visible === false ? true : undefined,
        components: {
            transform: createTransformComponent(object),
            ...components,
        },
        children,
    };
}

function decomposeObject(object: Object3D, options: Required<DecomposeModelOptions>): GameObject | null {
    if (!options.includeInvisible && !object.visible) return null;

    const childNodes = object.children
        .map(child => decomposeObject(child, options))
        .filter((child): child is GameObject => child != null);

    if (!(object instanceof Mesh)) {
        return createNode(object, options.idPrefix, childNodes);
    }

    const parts = getMeshParts(object);
    const materialComponents = parts.reduce<Record<string, ComponentData>>((result, part) => {
        result[part.key] = serializeMaterial(part.material, part.attach, options);
        return result;
    }, {});

    return createNode(object, options.idPrefix, childNodes, {
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
    });
}

/**
 * Converts a live Three object hierarchy into prefab JSON nodes made from
 * Transform, BufferGeometry, and Material components.
 */
export function decomposeModelToPrefabNodes(
    object: Object3D,
    options: DecomposeModelOptions = {},
): GameObject {
    return decomposeObject(object, {
        idPrefix: options.idPrefix ?? 'model',
        includeInvisible: options.includeInvisible ?? false,
        getTexturePath: options.getTexturePath ?? (() => undefined),
    }) ?? createNode(object, options.idPrefix ?? 'model');
}
