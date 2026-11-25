import { applyProps, extend, type ThreeElement } from '@react-three/fiber';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import {
    BackSide, ClampToEdgeWrapping, Color, DoubleSide, FrontSide, LinearFilter, LinearMipmapLinearFilter,
    LinearMipmapNearestFilter, NearestFilter, NearestMipmapLinearFilter, NearestMipmapNearestFilter,
    NoColorSpace, RepeatWrapping, SRGBColorSpace,
    type MagnificationTextureFilter, type Material, type MinificationTextureFilter, type Texture,
} from 'three';
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial, type Node } from 'three/webgpu';
import { Fn, materialReference, normalMap as sampleNormal, parallaxDirection, texture as sampleTexture, uv, vec2, vec4 } from 'three/tsl';
import { materialTextureDependencies } from '../../core/dependencies.js';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { compactPrefabMaterial, getMaterialDefinition, resolveMaterialProperties } from '../../core/prefab.js';
import type { MaterialComponentProperties, PrefabMaterial, PrefabMaterialType } from '../../core/types.js';
import { useTextureAsset } from '../assets/AssetRuntime.js';
import { withBasePath } from '../assets/assetPaths.js';
import { useNamedMaterialDefinition, useSharedMaterialResource } from '../rendering/MaterialPoolProvider.js';
import { useInvalidateMeshInstances } from '../rendering/MeshInstanceProvider.js';
import { usePrefab } from '../scene/SceneContext.js';

type ResolvedProperties = ReturnType<typeof resolveMaterialProperties>;

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

function cloneMaterialTexture(source: Texture | null | undefined, options: ResolvedProperties, colorSpace: Texture['colorSpace']) {
    if (!source) return;
    const texture = source.clone();
    texture.wrapS = texture.wrapT = options.repeat ? RepeatWrapping : ClampToEdgeWrapping;
    if (options.repeat) texture.repeat.fromArray(options.repeatCount);
    else texture.repeat.set(1, 1);
    texture.offset.fromArray(options.offset);
    texture.colorSpace = colorSpace;
    texture.generateMipmaps = options.generateMipmaps;
    texture.anisotropy = Math.min(16, Math.max(1, Math.round(options.anisotropy)));
    texture.minFilter = MIN_FILTER_MAP[options.minFilter] ?? LinearMipmapLinearFilter;
    texture.magFilter = MAG_FILTER_MAP[options.magFilter] ?? LinearFilter;
    texture.needsUpdate = true;
    return texture;
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

function createMaterial(type: PrefabMaterialType = 'standard'): RuntimeMaterial {
    if (type === 'basic') return new MeshBasicNodeMaterial();
    if (type === 'sprite') return new SpriteNodeMaterial();
    return new MeshPhysicalNodeMaterial();
}

const unresolvedMaterial = new MeshBasicNodeMaterial();
unresolvedMaterial.visible = false;

// Node edits replace material property objects, so repeated references can share a signature.
const materialSignatures = new WeakMap<PrefabMaterial, Map<string, string>>();

function getMaterialSignature(material: PrefabMaterial, basePath: string) {
    const cached = materialSignatures.get(material)?.get(basePath);
    if (cached) return cached;
    const { texture, normalMapTexture, name: _name, ...properties } = compactPrefabMaterial(material);
    const signature = JSON.stringify(Object.entries({
        ...properties,
        ...(texture ? { texture: withBasePath(basePath, texture) } : null),
        ...(normalMapTexture ? { normalMapTexture: withBasePath(basePath, normalMapTexture) } : null),
    }).sort(([left], [right]) => left.localeCompare(right)));
    let byPath = materialSignatures.get(material);
    if (!byPath) materialSignatures.set(material, byPath = new Map());
    byPath.set(basePath, signature);
    return signature;
}

function applyMaterialProperties(
    material: RuntimeMaterial,
    properties: ResolvedProperties,
    map: Texture | null | undefined,
    normalMap: Texture | null | undefined,
) {
    const materialType = properties.materialType;
    const common = {
        name: properties.name ?? '',
        color: new Color(properties.color),
        visible: (!properties.texture || !!map) && (!properties.normalMapTexture || !!normalMap),
        toneMapped: properties.toneMapped,
        transparent: properties.transparent,
        opacity: properties.opacity,
        alphaTest: properties.alphaTest,
        depthTest: properties.depthTest,
        depthWrite: properties.depthWrite,
        map: map ?? null,
    };

    applyProps(material, materialType === 'sprite' ? {
        ...common,
        rotation: properties.rotation,
        sizeAttenuation: properties.sizeAttenuation,
    } : {
        ...common,
        wireframe: properties.wireframe,
        side: SIDE_MAP[properties.side],
        ...(materialType === 'standard' ? {
            metalness: properties.metalness,
            roughness: properties.roughness,
            diffuseRoughness: properties.diffuseRoughness,
            emissive: new Color(properties.emissive),
            emissiveIntensity: properties.emissiveIntensity,
            transmission: properties.transmission,
            thickness: properties.thickness,
            ior: properties.ior,
            normalMap: normalMap ?? null,
            normalScale: normalMap ? properties.normalScale : [1, 1],
        } : null),
    });
    const parallaxScale = properties.parallaxScale;
    if (material instanceof MeshPhysicalNodeMaterial && map && normalMap && parallaxScale > 0 && !material.transparent && material.alphaTest === 0) {
        const surfaceUV = uv().mul(vec2(...map.repeat)).add(vec2(...map.offset));
        const depth = sampleTexture(normalMap, surfaceUV).a.oneMinus().mul(parallaxScale);
        const view = parallaxDirection as Node<'vec3'>;
        // Limit the offset at grazing angles to keep shallow relief stable in motion.
        const displacedUV = surfaceUV.sub(view.xy.div(view.z.max(0.35)).mul(depth)).toVar();
        const tint = materialReference('color', 'color') as unknown as Node<'vec3'>;
        material.colorNode = Fn(builder => {
            // Three also reads colorNode alpha when building the shadow pass.
            if (builder.material && 'isShadowPassMaterial' in builder.material) return vec4(1);
            return vec4(tint, 1).mul(sampleTexture(map, displacedUV));
        })();
        material.normalNode = sampleNormal(sampleTexture(normalMap, displacedUV).rgb, vec2(...properties.normalScale));
    }
    material.needsUpdate = true;
}

const DEFAULT_MATERIAL: PrefabMaterial = Object.freeze({});

function MaterialComponentView({ properties, children }: { properties: MaterialComponentProperties; children?: ReactNode; enabled: boolean }) {
    const { basePath } = usePrefab();
    const material = useMemo(() => getMaterialDefinition(properties), [properties]);
    return <>
        {properties.name
            ? <NamedMaterial name={properties.name} material={material} basePath={basePath} attach={properties.attach} />
            : <ResolvedMaterial material={material ?? DEFAULT_MATERIAL} basePath={basePath} attach={properties.attach} />}
        {children}
    </>;
}

// Only named references need a registry subscription and definition lifecycle.
function NamedMaterial({ name, material, basePath, attach }: {
    name: string; material: PrefabMaterial | null; basePath: string; attach?: string;
}) {
    const definition = useNamedMaterialDefinition(name, material, basePath);
    return definition
        ? <ResolvedMaterial material={definition.material} basePath={definition.basePath} attach={attach} />
        : <primitive object={unresolvedMaterial} attach={attach ?? 'material'} dispose={null} />;
}

function ResolvedMaterial({ material, basePath, attach }: { material: PrefabMaterial; basePath: string; attach?: string }) {
    const texture = useTextureAsset(material.texture ? withBasePath(basePath, material.texture) : null);
    const normal = useTextureAsset(material.normalMapTexture ? withBasePath(basePath, material.normalMapTexture) : null);
    const sharedMaterial = useSharedMaterialResource(
        `standard:${getMaterialSignature(material, basePath)}:${texture?.uuid ?? ''}:${normal?.uuid ?? ''}`,
        () => {
            const properties = resolveMaterialProperties(material);
            const result = createMaterial(properties.materialType);
            const map = cloneMaterialTexture(texture, properties, SRGBColorSpace);
            const normalMap = cloneMaterialTexture(normal, properties, NoColorSpace);
            applyMaterialProperties(result, properties, map, normalMap);
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
    category: 'materials',
    renderWhenDisabled: true,
    description: 'Define a shared material with a name and settings, or reference a loaded scene material using only its name. Unresolved references remain invisible.',
    slot: 'material', exclusive: 'material',
    View: MaterialComponentView,
    dependencies: materialTextureDependencies,
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
        diffuseRoughness: { description: "Diffuse scattering roughness for concrete, clay and other matte surfaces; 0 uses Lambertian reflection.", default: undefined, min: 0, max: 1 },
        emissive: { type: "color", default: undefined },
        emissiveIntensity: { default: undefined, min: 0, step: 0.1 },
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
        parallaxScale: { description: 'Shallow UV offset for opaque lit surfaces, using normal map alpha. White is the surface and black is recessed.', default: undefined, min: 0, max: 0.1, step: 0.001 },
        generateMipmaps: { type: 'boolean', default: undefined },
        anisotropy: { description: 'Improve mipmapped texture detail at grazing angles.', default: undefined, min: 1, max: 16, step: 1 },
        minFilter: { type: 'string', default: undefined },
        magFilter: { type: 'string', default: undefined },
        side: { type: 'select', default: undefined, options: [
            { value: 'FrontSide', label: 'Front' }, { value: 'BackSide', label: 'Back' }, { value: 'DoubleSide', label: 'Double' },
        ] },
    },
} satisfies Component<MaterialComponentProperties>;

export default MaterialComponent;
