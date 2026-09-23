import { useInvalidateMeshInstances } from "../MeshInstanceProvider";
import { BackSide, DoubleSide, NearestFilter, NearestMipmapNearestFilter, NearestMipmapLinearFilter, LinearMipmapNearestFilter } from "three";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { applyProps, extend } from '@react-three/fiber';

import type { ThreeElement } from '@react-three/fiber';

import type { Component, ComponentViewProps } from './ComponentRegistry';

import { useTextureAsset } from '../assetRuntime';

import { usePrefab } from '../SceneContext';

import { usePrefabStore } from '../prefabStore';

import { compactPrefabMaterial, DEFAULT_MATERIAL_ID } from '../prefab';

import type { MaterialComponentProperties, PrefabMaterial, PrefabMaterialType } from '../types';

import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';

import { withBasePath } from '../runtimeUtils';

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

function useConfiguredTexture(texture: Texture | null | undefined, options: TextureConfig) {
    const {
        colorSpace,
        repeat,
        repeatCount,
        offset,
        generateMipmaps,
        minFilter,
        magFilter,
    } = options;
    const configuredTexture = useMemo(() => texture?.clone(), [texture]);

    useLayoutEffect(() => {
        configureTexture(configuredTexture, {
            colorSpace,
            repeat,
            repeatCount,
            offset,
            generateMipmaps,
            minFilter,
            magFilter,
        });
    }, [
        configuredTexture,
        colorSpace,
        repeat,
        repeatCount,
        offset,
        generateMipmaps,
        minFilter,
        magFilter,
    ]);

    useEffect(() => () => configuredTexture?.dispose(), [configuredTexture]);

    return configuredTexture;
}

export function useMaterialOverrides(): MaterialOverrides {
    return useContext(MaterialOverridesContext);
}

export function MaterialOverridesProvider({
    overrides,
    children,
}: {
    overrides: MaterialOverrides;
    children: ReactNode;
}) {
    const parent = useContext(MaterialOverridesContext);
    const merged = useMemo(() => ({ ...parent, ...overrides }), [parent, overrides]);
    return <MaterialOverridesContext.Provider value={merged}>{children}</MaterialOverridesContext.Provider>;
}

extend({
    MeshBasicNodeMaterial,
    MeshStandardNodeMaterial,
    SpriteNodeMaterial,
});

type RuntimeMaterial = MeshBasicNodeMaterial | MeshStandardNodeMaterial | SpriteNodeMaterial;

type SharedMaterials = { byId: ReadonlyMap<string, RuntimeMaterial> };
const materialSources = new WeakMap<Material, Material>();
const SharedMaterialsContext = createContext<SharedMaterials>({ byId: new Map() });
type MaterialEntry = {
    key: string;
    material: Material;
    references: number;
    configured: boolean;
    configuration?: { properties: PrefabMaterial; basePath: string };
};

class SceneMaterialPool {
    readonly entries = new Map<string, MaterialEntry>();
    private listeners = new Set<() => void>();
    private revision = 0;
    private scheduled = false;
    lifetime: object | null = null;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getSnapshot = () => this.revision;
    changed = () => {
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.revision++;
            this.listeners.forEach(listener => listener());
        });
    };
    get(key: string, create: () => Material, configuration?: MaterialEntry['configuration']) {
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { key, material: create(), references: 0, configured: !configuration, configuration };
            this.entries.set(key, entry);
            this.changed();
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
                this.changed();
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

function ConfiguredSharedMaterial({ entry, pool }: { entry: MaterialEntry; pool: SceneMaterialPool }) {
    const { basePath, properties } = entry.configuration!;
    const material = entry.material as RuntimeMaterial;
    const textureName = properties.texture;
    const normalMapTextureName = properties.normalMapTexture;
    const texture = useTextureAsset(textureName ? withBasePath(basePath, textureName) : textureName) ?? undefined;
    const normalMapTexture = useTextureAsset(normalMapTextureName ? withBasePath(basePath, normalMapTextureName) : normalMapTextureName) ?? undefined;
    const textureConfig = {
        repeat: properties.repeat, repeatCount: properties.repeatCount, offset: properties.offset,
        generateMipmaps: properties.generateMipmaps !== false,
        minFilter: MIN_FILTER_MAP[properties.minFilter ?? 'LinearMipmapLinearFilter'] ?? LinearMipmapLinearFilter,
        magFilter: MAG_FILTER_MAP[properties.magFilter ?? 'LinearFilter'] ?? LinearFilter,
    };
    const map = useConfiguredTexture(texture, { ...textureConfig, colorSpace: SRGBColorSpace });
    const normalMap = useConfiguredTexture(normalMapTexture, { ...textureConfig, colorSpace: NoColorSpace });
    useLayoutEffect(() => {
        applyMaterialProperties(material, properties, map, normalMap, EMPTY_MATERIAL_OVERRIDES);
        entry.configured = (!textureName || !!map) && (!normalMapTextureName || !!normalMap);
        pool.changed();
    }, [entry, map, material, normalMap, normalMapTextureName, pool, properties, textureName]);
    return null;
}

export function MaterialRuntimeProvider({ children }: { children: ReactNode }) {
    return <MaterialPoolProvider><MaterialRuntimeLayer>{children}</MaterialRuntimeLayer></MaterialPoolProvider>;
}
export function MaterialPoolProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(SceneMaterialPoolContext);
    if (inherited) return children;
    return <SceneMaterialPoolOwner>{children}</SceneMaterialPoolOwner>;
}
function SceneMaterialPoolOwner({ children }: { children: ReactNode }) {
    const [pool] = useState(() => new SceneMaterialPool());
    useSyncExternalStore(pool.subscribe, pool.getSnapshot, pool.getSnapshot);
    useEffect(() => {
        const lifetime = {};
        pool.lifetime = lifetime;
        return () => { queueMicrotask(() => { if (pool.lifetime === lifetime) pool.dispose(); }); };
    }, [pool]);
    return <SceneMaterialPoolContext.Provider value={pool}>
        {children}
        {[...pool.entries.values()].filter(entry => entry.configuration).map(entry => (
            <ConfiguredSharedMaterial key={entry.material.uuid} entry={entry} pool={pool} />
        ))}
    </SceneMaterialPoolContext.Provider>;
}

/** Shared shader/material implementations use the same scene ownership as built-in materials. */
export function useSharedMaterialResource<T extends Material>(key: string, create: () => T): T {
    const pool = useContext(SceneMaterialPoolContext);
    if (!pool) throw new Error('Shared materials require a scene material pool');
    const entry = useMemo(() => pool.get(`custom:${key}`, create), [pool, key]);
    useLayoutEffect(() => pool.retain(entry), [entry, pool]);
    return entry.material as T;
}

export function useSceneMaterialStatus(root: import("three").Object3D) {
    const pool = useContext(SceneMaterialPoolContext);
    if (!pool) throw new Error('Material status requires a scene material pool');
    const revision = useSyncExternalStore(pool.subscribe, pool.getSnapshot, pool.getSnapshot);
    return { revision, pending: getPendingMaterialCount(root, pool.entries.values()) };
}

/** Count only materials used by this instance, including local override copies. */
export function getPendingMaterialCount(root: import("three").Object3D, entries: Iterable<Pick<MaterialEntry, 'material' | 'configured'>>) {
    const used = new Set<Material>();
    root.traverse(object => {
        const material = (object as import("three").Mesh).material;
        if (Array.isArray(material)) material.forEach(value => used.add(materialSources.get(value) ?? value));
        else if (material) used.add(materialSources.get(material) ?? material);
    });
    return [...entries].filter(entry => used.has(entry.material) && !entry.configured).length;
}

function MaterialRuntimeLayer({ children }: { children: ReactNode }) {
    const materials = usePrefabStore(state => state.materials);
    const { basePath } = usePrefab();
    const pool = useContext(SceneMaterialPoolContext)!;
    const entries = useMemo(() => Object.entries(materials).map(([id, properties]) => ({
        id, entry: pool.get(`standard:${getMaterialSignature(properties, basePath)}`, () => {
            const material = createMaterial(properties.materialType);
            applyMaterialProperties(material, properties, undefined, undefined, EMPTY_MATERIAL_OVERRIDES);
            return material;
        }, { properties, basePath }),
    })), [basePath, materials, pool]);
    useLayoutEffect(() => {
        const release = entries.map(({ entry }) => pool.retain(entry));
        return () => release.forEach(dispose => dispose());
    }, [entries, pool]);
    const shared = useMemo(() => ({ byId: new Map(entries.map(({ id, entry }) => [id, entry.material as RuntimeMaterial])) }), [entries]);
    return <SharedMaterialsContext.Provider value={shared}>{children}</SharedMaterialsContext.Provider>;
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
        color: properties.color ?? '#ffffff',
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
    const sharedMaterials = useContext(SharedMaterialsContext);
    const sharedMaterial = sharedMaterials.byId.get(materialId) ?? sharedMaterials.byId.get(DEFAULT_MATERIAL_ID);
    const materialType = material.materialType ?? 'standard';
    const overrides = useMaterialOverrides();
    const ownsMaterial = Object.keys(overrides).length > 0;
    const pool = useContext(SceneMaterialPoolContext)!;
    const materialRevision = useSyncExternalStore(pool.subscribe, () => ownsMaterial ? pool.getSnapshot() : 0, () => 0);
    const localMaterial = useMemo(() => ownsMaterial ? createMaterial(materialType) : null, [materialType, ownsMaterial]);
    const resolvedMaterial = localMaterial ?? sharedMaterial;
    const invalidateInstances = useInvalidateMeshInstances();
    useLayoutEffect(invalidateInstances, [resolvedMaterial, invalidateInstances]);

    useEffect(() => () => localMaterial?.dispose(), [localMaterial]);
    useLayoutEffect(() => {
        if (!localMaterial || !sharedMaterial) return;
        materialSources.set(localMaterial, sharedMaterial);
        localMaterial.copy(sharedMaterial);
        applyProps(localMaterial, overrides);
        localMaterial.needsUpdate = true;
    }, [localMaterial, material, materialRevision, overrides, sharedMaterial]);
    return <>
        {resolvedMaterial ? <primitive object={resolvedMaterial as Material} attach={properties.attach} dispose={null} /> : null}
        {children}
    </>;
}

const MaterialComponent: Component<MaterialComponentProperties> = {
    name: 'Material',
    slot: 'material',
    renderWhenDisabled: true,
    View: MaterialComponentView,
    properties: {
        attach: { type: 'string', default: 'material' },
        materialId: { type: 'string', default: DEFAULT_MATERIAL_ID },
    },
};

export default MaterialComponent;
