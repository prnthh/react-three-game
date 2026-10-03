import { registerInstancedMaterial } from '../rendering/materialInstancing';
import type { Node } from 'three/webgpu';
import { useInvalidateMeshInstances } from "../rendering/MeshInstanceProvider";
import { Color, BackSide, DoubleSide, NearestFilter, NearestMipmapNearestFilter, NearestMipmapLinearFilter, LinearMipmapNearestFilter } from "three";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import { applyProps, extend } from '@react-three/fiber';

import type { ThreeElement } from '@react-three/fiber';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

import { useTextureAsset } from '../assets/AssetRuntime';

import { usePrefab } from '../scene/SceneContext';

import { usePrefabStore } from "../prefabs/PrefabStoreContext";

import { compactPrefabMaterial, DEFAULT_MATERIAL_ID } from '../../core/prefab';

import type { MaterialComponentProperties, PrefabMaterial, PrefabMaterialType } from '../../core/types';

import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';

import { withBasePath } from "../assets/assetPaths";

import { RepeatWrapping, ClampToEdgeWrapping, NoColorSpace, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter, FrontSide } from 'three';

import type { MinificationTextureFilter, MagnificationTextureFilter, Material, Texture } from 'three';

type TextureConfig = {
    colorSpace: Texture['colorSpace'];
    repeat?: boolean;
    repeatCount?: [number, number];
    offset?: [number, number];
    generateMipmaps: boolean;
    minFilter: MinificationTextureFilter;
    magFilter: MagnificationTextureFilter;
};

declare module '@react-three/fiber' {
    interface ThreeElements {
        meshBasicNodeMaterial: ThreeElement<typeof MeshBasicNodeMaterial>;
        meshStandardNodeMaterial: ThreeElement<typeof MeshStandardNodeMaterial>;
        spriteNodeMaterial: ThreeElement<typeof SpriteNodeMaterial>;
    }
}

export type MaterialProps = PrefabMaterial;

export type MaterialOverrides = Record<string, unknown>;

const EMPTY_MATERIAL_OVERRIDES: MaterialOverrides = Object.freeze({});

// R3F's CJS entry and Three's ESM node materials can have different Color
// constructors in Node. Supply Color objects so applyProps preserves the math type.
function applyMaterialOverrides<T extends Material>(material: T, overrides: MaterialOverrides): T {
    const resolved = { ...overrides };
    for (const [key, value] of Object.entries(resolved)) {
        const target = (material as unknown as Record<string, unknown>)[key] as Color | undefined;
        if (target?.isColor && (typeof value === 'string' || typeof value === 'number' || (value as Color)?.isColor)) {
            resolved[key] = target.clone().set(value as Color | string | number);
        }
    }
    return applyProps(material, resolved);
}

const MaterialOverrideKeyContext = createContext<string | undefined>(undefined);

const MaterialOverridesContext = createContext<MaterialOverrides>(EMPTY_MATERIAL_OVERRIDES);

const SIDE_MAP = { FrontSide, BackSide, DoubleSide } as const;

const MIN_FILTER_MAP: Record<string, MinificationTextureFilter> = {
    NearestFilter,
    LinearFilter,
    NearestMipmapNearestFilter,
    NearestMipmapLinearFilter,
    LinearMipmapNearestFilter,
    LinearMipmapLinearFilter,
};

const MAG_FILTER_MAP: Record<string, MagnificationTextureFilter> = {
    NearestFilter,
    LinearFilter,
};

function configureTexture(
    texture: Texture | null | undefined,
    options: TextureConfig,
) {
    if (!texture) return;

    if (options.repeat) {
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.repeat.set(options.repeatCount?.[0] ?? 1, options.repeatCount?.[1] ?? 1);
    } else {
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.repeat.set(1, 1);
    }

    texture.offset.set(options.offset?.[0] ?? 0, options.offset?.[1] ?? 0);
    texture.colorSpace = options.colorSpace;
    texture.generateMipmaps = options.generateMipmaps;
    texture.minFilter = options.minFilter;
    texture.magFilter = options.magFilter;
    texture.needsUpdate = true;
}

export function useMaterialOverrides(): MaterialOverrides {
    return useContext(MaterialOverridesContext);
}

export function MaterialOverridesProvider({
    overrides,
    children,
    cacheKey,
}: {
    overrides: MaterialOverrides;
    children: ReactNode;
    /** Opt in to sharing immutable overrides. Include every override value in this key. */
    cacheKey?: string;
}) {
    const parent = useContext(MaterialOverridesContext);
    const merged = useMemo(() => ({ ...parent, ...overrides }), [parent, overrides]);
    // Nested overrides may carry per-object values, so only share an otherwise empty scope.
    return <MaterialOverrideKeyContext.Provider value={Object.keys(parent).length ? undefined : cacheKey}>
        <MaterialOverridesContext.Provider value={merged}>{children}</MaterialOverridesContext.Provider>
    </MaterialOverrideKeyContext.Provider>;
}

extend({
    MeshBasicNodeMaterial,
    MeshStandardNodeMaterial,
    SpriteNodeMaterial,
});

type RuntimeMaterial = MeshBasicNodeMaterial | MeshStandardNodeMaterial | SpriteNodeMaterial;

type MaterialEntry = {
    key: string;
    material: Material;
    references: number;
};

class SceneMaterialPool {
    readonly entries = new Map<string, MaterialEntry>();
    lifetime: object | null = null;
    get(key: string, create: () => Material) {
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { key, material: create(), references: 0 };
            this.entries.set(key, entry);
        }
        return entry;
    }
    retain(entry: MaterialEntry) {
        entry.references++;
        return () => {
            entry.references--;
            queueMicrotask(() => {
                if (entry.references > 0 || this.entries.get(entry.key) !== entry) return;
                this.entries.delete(entry.key);
                entry.material.dispose();
            });
        };
    }
    dispose() { this.entries.forEach(entry => entry.material.dispose()); this.entries.clear(); }
}
const SceneMaterialPoolContext = createContext<SceneMaterialPool | null>(null);

function createMaterial(type: PrefabMaterialType = 'standard'): RuntimeMaterial {
    if (type === 'basic') return new MeshBasicNodeMaterial();
    if (type === 'sprite') return new SpriteNodeMaterial();
    return new MeshStandardNodeMaterial();
}

function getMaterialSignature(material: PrefabMaterial, basePath: string) {
    const { texture, normalMapTexture, name: _name, ...properties } = compactPrefabMaterial(material);
    return JSON.stringify(Object.entries({
        ...properties,
        ...(texture ? { texture: withBasePath(basePath, texture) } : null),
        ...(normalMapTexture ? { normalMapTexture: withBasePath(basePath, normalMapTexture) } : null),
    }).sort(([left], [right]) => left.localeCompare(right)));
}

export function MaterialPoolProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(SceneMaterialPoolContext);
    if (inherited) return children;
    return <SceneMaterialPoolOwner>{children}</SceneMaterialPoolOwner>;
}
function SceneMaterialPoolOwner({ children }: { children: ReactNode }) {
    const [pool] = useState(() => new SceneMaterialPool());
    useEffect(() => {
        const lifetime = {};
        pool.lifetime = lifetime;
        return () => { queueMicrotask(() => { if (pool.lifetime === lifetime) pool.dispose(); }); };
    }, [pool]);
    return <SceneMaterialPoolContext.Provider value={pool}>
        {children}
    </SceneMaterialPoolContext.Provider>;
}

export type SharedMaterialOptions<T extends Material> = {
    /** Optional shader variant for object-local calculations in an instance batch.
     * Return a new material; the renderer owns its disposal. Never mutate source.
     * Include every shader dependency in the resource key, just as for create(). */
    createInstanced?: (source: T, inverseInstanceMatrix: Node<'mat4'>) => Material;
};

/** Immutable materials are shared by key; resource changes automatically refresh batches. */
export function useSharedMaterialResource<T extends Material>(key: string, create: () => T, options?: SharedMaterialOptions<T>): T {
    const pool = useContext(SceneMaterialPoolContext);
    if (!pool) throw new Error('Shared materials require a scene material pool');
    const entry = useMemo(() => pool.get(`custom:${key}`, () => {
        const material = create();
        const createInstanced = options?.createInstanced;
        if (createInstanced) registerInstancedMaterial(material, inverse => createInstanced(material, inverse));
        return material;
    }), [pool, key]);
    useEffect(() => pool.retain(entry), [entry, pool]);
    const invalidateInstances = useInvalidateMeshInstances();
    useLayoutEffect(invalidateInstances, [entry.material, invalidateInstances]);
    return entry.material as T;
}

function applyMaterialProperties(
    material: RuntimeMaterial,
    properties: PrefabMaterial,
    map: Texture | null | undefined,
    normalMap: Texture | null | undefined,
    overrides: MaterialOverrides,
) {
    const materialType = properties.materialType ?? 'standard';
    const common = {
        name: properties.name ?? '',
        color: new Color(properties.color ?? '#ffffff'),
        visible: (!properties.texture || !!map) && (!properties.normalMapTexture || !!normalMap),
        toneMapped: properties.toneMapped ?? true,
        transparent: properties.transparent ?? materialType === 'sprite',
        opacity: properties.opacity ?? 1,
        alphaTest: properties.alphaTest ?? 0,
        depthTest: properties.depthTest ?? materialType !== 'sprite',
        depthWrite: properties.depthWrite ?? materialType !== 'sprite',
        map: map ?? null,
    };

    applyProps(material, materialType === 'sprite' ? {
        ...common,
        rotation: properties.rotation ?? 0,
        sizeAttenuation: properties.sizeAttenuation ?? true,
        ...overrides,
    } : {
        ...common,
        wireframe: properties.wireframe ?? false,
        side: properties.side ? SIDE_MAP[properties.side] : FrontSide,
        ...(materialType === 'standard' ? {
            metalness: properties.metalness ?? 0,
            roughness: properties.roughness ?? 1,
            transmission: properties.transmission ?? 0,
            thickness: properties.thickness ?? 0,
            ior: properties.ior ?? 1.5,
            normalMap: normalMap ?? null,
            normalScale: normalMap ? properties.normalScale ?? [1, 1] : [1, 1],
        } : null),
        ...overrides,
    });
    material.needsUpdate = true;
}

function MaterialComponentView({ properties, children }: ComponentViewProps<MaterialComponentProperties>) {
    const materialId = properties.materialId ?? DEFAULT_MATERIAL_ID;
    const material = usePrefabStore(state => state.materials[materialId] ?? state.materials[DEFAULT_MATERIAL_ID]);
    const { basePath } = usePrefab();
    const texture = useTextureAsset(material.texture ? withBasePath(basePath, material.texture) : null);
    const normal = useTextureAsset(material.normalMapTexture ? withBasePath(basePath, material.normalMapTexture) : null);
    const sharedMaterial = useSharedMaterialResource(
        `standard:${getMaterialSignature(material, basePath)}:${texture?.uuid ?? ''}:${normal?.uuid ?? ''}`,
        () => {
            const result = createMaterial(material.materialType);
            const map = texture?.clone();
            const normalMap = normal?.clone();
            const config = {
                repeat: material.repeat, repeatCount: material.repeatCount, offset: material.offset,
                generateMipmaps: material.generateMipmaps !== false,
                minFilter: MIN_FILTER_MAP[material.minFilter ?? 'LinearMipmapLinearFilter'] ?? LinearMipmapLinearFilter,
                magFilter: MAG_FILTER_MAP[material.magFilter ?? 'LinearFilter'] ?? LinearFilter,
            };
            configureTexture(map, { ...config, colorSpace: SRGBColorSpace });
            configureTexture(normalMap, { ...config, colorSpace: NoColorSpace });
            applyMaterialProperties(result, material, map, normalMap, EMPTY_MATERIAL_OVERRIDES);
            result.addEventListener('dispose', () => { map?.dispose(); normalMap?.dispose(); });
            return result;
        },
    );
    const overrides = useMaterialOverrides();
    const ownsMaterial = Object.keys(overrides).length > 0;
    const overrideKey = useContext(MaterialOverrideKeyContext);
    // Unkeyed overrides remain node-local; memo identity changes must replace that material.
    const localMaterial = useMemo(() => ownsMaterial && overrideKey === undefined
        ? applyMaterialOverrides(sharedMaterial.clone(), overrides) : null, [sharedMaterial, overrides, ownsMaterial, overrideKey]);
    useEffect(() => () => localMaterial?.dispose(), [localMaterial]);
    const resolvedMaterial = ownsMaterial && overrideKey !== undefined
        ? <SharedOverrideMaterial source={sharedMaterial} overrides={overrides} cacheKey={overrideKey} attach={properties.attach} />
        : <primitive object={localMaterial ?? sharedMaterial} attach={properties.attach} dispose={null} />;
    const invalidateInstances = useInvalidateMeshInstances();
    useLayoutEffect(invalidateInstances, [localMaterial, sharedMaterial, invalidateInstances]);
    return <>
        {resolvedMaterial}
        {children}
    </>;
}

function SharedOverrideMaterial({ source, overrides, cacheKey, attach }: {
    source: Material; overrides: MaterialOverrides; cacheKey: string; attach?: string;
}) {
    const material = useSharedMaterialResource(`override:${source.uuid}:${cacheKey}`, () => applyMaterialOverrides(source.clone(), overrides));
    return <primitive object={material} attach={attach} dispose={null} />;
}

const MaterialComponent: Component<MaterialComponentProperties> = {
    name: 'Material',
    description: 'Named material definition. Matching built-in definitions share rendering resources automatically, even across IDs; edits to separate IDs stay independent.',
    slot: 'material',
    renderWhenDisabled: true,
    View: MaterialComponentView,
    properties: {
        attach: { type: 'string', default: 'material' },
        materialId: { type: 'string', default: DEFAULT_MATERIAL_ID, description: 'Reuse an ID to link edits across meshes. Different IDs with matching settings still share GPU resources.' },
    },
};

export default MaterialComponent;
