import { registerInstancedMaterial } from '../rendering/materialInstancing.js';
import type { Node } from 'three/webgpu';
import { useInvalidateMeshInstances } from "../rendering/MeshInstanceProvider.js";
import { Color, BackSide, DoubleSide, NearestFilter, NearestMipmapNearestFilter, NearestMipmapLinearFilter, LinearMipmapNearestFilter } from "three";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { applyProps, extend } from '@react-three/fiber';

import type { ThreeElement } from '@react-three/fiber';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

import { useTextureAsset } from '../assets/AssetRuntime.js';

import { useGameObject, usePrefab } from '../scene/SceneContext.js';
import { usePrefabStore } from '../prefabs/PrefabStoreContext.js';


import { compactPrefabMaterial, getMaterialDefinition } from '../../core/prefab.js';

import type { MaterialComponentProperties, PrefabMaterial, PrefabMaterialType } from '../../core/types.js';

import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';

import { withBasePath } from "../assets/assetPaths.js";

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
    private definitions = new Map<object, { name: string; material: PrefabMaterial; basePath: string; order: number }>();
    lifetime: object | null = null;
    private listeners = new Map<string, Set<() => void>>();
    subscribe = (name: string, listener: () => void) => {
        let listeners = this.listeners.get(name);
        if (!listeners) this.listeners.set(name, listeners = new Set());
        listeners.add(listener);
        return () => {
            listeners?.delete(listener);
            if (listeners?.size === 0) this.listeners.delete(name);
        };
    };
    private notify(name: string) { this.listeners.get(name)?.forEach(listener => listener()); }
    registerDefinition(owner: object, name: string, material: PrefabMaterial, basePath: string, order: number) {
        const previous = this.definitions.get(owner);
        this.definitions.set(owner, { name, material, basePath, order });
        if (previous && previous.name !== name) this.notify(previous.name);
        this.notify(name);
    }
    unregisterDefinition(owner: object) {
        const definition = this.definitions.get(owner);
        if (!definition) return;
        this.definitions.delete(owner);
        this.notify(definition.name);
    }
    resolve(name: string) {
        let resolved: { name: string; material: PrefabMaterial; basePath: string; order: number } | null = null;
        for (const definition of this.definitions.values()) {
            if (definition.name === name && (!resolved || definition.order < resolved.order)) resolved = definition;
        }
        return resolved;
    }
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

function MaterialComponentView({ properties, children }: { properties: MaterialComponentProperties; children?: ReactNode; enabled: boolean }) {
    const pool = useContext(SceneMaterialPoolContext);
    if (!pool) throw new Error('Materials require a scene material pool');
    const { basePath } = usePrefab();
    const node = useGameObject();
    const childIds = usePrefabStore(state => state.childIdsById[state.parentIdById[node.nodeId] ?? state.rootId] ?? []);
    const materialName = properties.name ?? '';
    const localMaterial = useMemo(() => getMaterialDefinition(properties), [properties]);
    const order = childIds.indexOf(node.nodeId);
    const [owner] = useState(() => ({}));
    const subscribe = useMemo(() => (listener: () => void) => pool.subscribe(materialName, listener), [pool, materialName]);
    const resolve = useMemo(() => () => pool.resolve(materialName), [pool, materialName]);
    const definition = useSyncExternalStore(subscribe, resolve, () => null);
    useLayoutEffect(() => {
        if (!materialName || !localMaterial) return;
        pool.registerDefinition(owner, materialName, localMaterial, basePath, order < 0 ? Number.MAX_SAFE_INTEGER : order);
        return () => pool.unregisterDefinition(owner);
    }, [pool, owner, materialName, localMaterial, basePath, order]);
    const material = definition?.material ?? localMaterial ?? (materialName ? undefined : {});
    return <>
        {material
            ? <ResolvedMaterial material={material} basePath={definition?.basePath ?? basePath} attach={properties.attach} />
            : <UnresolvedMaterial attach={properties.attach} />}
        {children}
    </>;
}

function UnresolvedMaterial({ attach }: { attach?: string }) {
    const material = useSharedMaterialResource('unresolved', () => {
        const value = new MeshBasicNodeMaterial();
        value.visible = false;
        return value;
    });
    return <primitive object={material} attach={attach ?? 'material'} dispose={null} />;
}

function ResolvedMaterial({ material, basePath, attach }: { material: PrefabMaterial; basePath: string; attach?: string }) {
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
        ? <SharedOverrideMaterial source={sharedMaterial} overrides={overrides} cacheKey={overrideKey} attach={attach ?? 'material'} />
        : <primitive object={localMaterial ?? sharedMaterial} attach={attach ?? 'material'} dispose={null} />;
    const invalidateInstances = useInvalidateMeshInstances();
    useLayoutEffect(invalidateInstances, [localMaterial, sharedMaterial, invalidateInstances]);
    return resolvedMaterial;
}

function SharedOverrideMaterial({ source, overrides, cacheKey, attach }: {
    source: Material; overrides: MaterialOverrides; cacheKey: string; attach?: string;
}) {
    const material = useSharedMaterialResource(`override:${source.uuid}:${cacheKey}`, () => applyMaterialOverrides(source.clone(), overrides));
    return <primitive object={material} attach={attach} dispose={null} />;
}

const MaterialComponent = {
    name: 'Material',
    description: 'Define a shared material with a name and settings, or reference a loaded scene material using only its name. Unresolved references remain invisible.',
    slot: 'material',
    renderWhenDisabled: true,
    View: MaterialComponentView,
    dependencies: properties => [properties.texture, properties.normalMapTexture]
        .filter((path): path is string => !!path).map(path => ({ kind: 'texture' as const, path })),
    properties: {
        attach: { description: "R3F material attachment; normally leave as \"material\".", type: 'string', default: 'material' },
        name: { type: 'string', default: '', description: 'Scene-wide material name. With settings, defines this material; alone, references a definition on any loaded node.' },
        materialType: { description: "standard responds to lights; basic is unlit; sprite is for Sprite nodes.", type: 'select', default: undefined, options: [
            { value: 'standard', label: 'Standard' }, { value: 'basic', label: 'Basic' }, { value: 'sprite', label: 'Sprite' },
        ] },
        color: { type: 'color', default: undefined },
        toneMapped: { type: 'boolean', default: undefined },
        wireframe: { type: 'boolean', default: undefined },
        transparent: { description: "Enable alpha blending when using opacity below 1 or texture transparency.", type: 'boolean', default: undefined },
        opacity: { description: "Alpha multiplier from 0 to 1; set transparent:true for blending.", default: undefined, min: 0, max: 1 },
        alphaTest: { default: undefined, min: 0, max: 1 },
        depthTest: { type: 'boolean', default: undefined },
        depthWrite: { type: 'boolean', default: undefined },
        metalness: { description: "Metallic response from 0 (nonmetal) to 1 (metal), for lit materials.", default: undefined, min: 0, max: 1 },
        roughness: { description: "Surface roughness from 0 (smooth) to 1 (rough), for lit materials.", default: undefined, min: 0, max: 1 },
        transmission: { default: undefined, min: 0, max: 1 },
        thickness: { default: undefined, min: 0 },
        ior: { default: undefined, min: 1 },
        rotation: { default: undefined },
        sizeAttenuation: { type: 'boolean', default: undefined },
        texture: { description: "Color-map image path relative to basePath, or an absolute URL.", type: 'string', default: undefined },
        normalMapTexture: { description: "Normal-map image path relative to basePath, or an absolute URL.", type: 'string', default: undefined },
        offset: { description: "Texture UV offset along u and v.", type: 'vector2', default: undefined },
        repeat: { description: "Enable texture wrapping; set repeatCount to control tiling.", type: 'boolean', default: undefined },
        repeatCount: { description: "Texture tile counts along u and v; use with repeat:true.", type: 'vector2', default: undefined },
        normalScale: { type: 'vector2', default: undefined },
        generateMipmaps: { type: 'boolean', default: undefined },
        minFilter: { type: 'string', default: undefined },
        magFilter: { type: 'string', default: undefined },
        side: { type: 'select', default: undefined, options: [
            { value: 'FrontSide', label: 'Front' }, { value: 'BackSide', label: 'Back' }, { value: 'DoubleSide', label: 'Double' },
        ] },
    },
} satisfies Component<MaterialComponentProperties>;

export default MaterialComponent;
