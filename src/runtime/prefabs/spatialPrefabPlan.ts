import { yieldToFrame } from '../scene/frame.js';
import { GEOMETRY_ARGS, primitiveBounds } from '../components/GeometryComponent.js';
import { Box3, Matrix4, Vector3, type Object3D } from 'three';
import { getMaterialDefinition, normalizePrefab, type PrefabState } from '../../core/prefab.js';
import { getComponent, getComponentRegistryVersion, isBuiltInComponent } from '../../core/ComponentRegistry.js';
import { findComponent, type GameObject, type Prefab, type PrefabMaterial } from '../../core/types.js';
import { composeTransform } from '../../core/transforms.js';
import { resolveInlinePrefab } from '../../core/inlinePrefabs.js';
import { buildChunkTree, type ChunkTree } from '../spatial/chunkTree.js';
import { looseOctreeKey } from '../spatial/spatialCell.js';
import { withBasePath } from '../assets/assetPaths.js';
import { batchStaticPrimitives, type StaticPrimitiveBatch } from './staticPrimitiveBatches.js';

import { finitePositive, STREAMING_DEFAULTS, type PrefabStreamingOptions } from './streamingOptions.js';

export interface SpatialPrefabChunk {
    id: string;
    bounds: Box3;
    rendererBounds: Box3[];
    document: PrefabState;
    cellKey: string;
    cullable: boolean;
    batches?: StaticPrimitiveBatch[];
}
export interface SpatialPrefabPlan {
    tree: ChunkTree;
    chunks: SpatialPrefabChunk[];
    resident: PrefabState;
    residentStatic: boolean;
    materials: ReadonlyMap<string, PrefabMaterial>;
}
type Bucket = { cullable: boolean; roots: GameObject[]; nodes: Map<string, GameObject>; bounds: Box3; rendererBounds: Box3[]; part: number; primitives?: Map<GameObject, Matrix4> };
export interface SpatialPlanRuntime {
    getPrefab(path: string): PrefabState | null;
    getModel?(path: string): Object3D | null;
    batchPrimitives?: boolean;
    lookup?: typeof getComponent;
}

// Keep one completed layout per immutable source. Plans that read external
// prefabs or models must observe the current assets on the next placement.
const completedPlans = new WeakMap<PrefabState, { key: string; plan: SpatialPrefabPlan }>();

const visualTypes = new Set(['Transform', 'Geometry', 'Material', 'Data', 'PrefabRef', 'Model']);
const fixedResidentTypes = new Set(['Fog', 'AmbientLight', 'PointLight', 'SpotLight', 'HemisphereLight']);
const residentTypes = new Set([...fixedResidentTypes, 'DiffuseLightProbe', 'DirectionalLight', 'Camera', 'Environment', 'Sky']);
function matrixOf(node: GameObject) {
    const properties = findComponent(node, 'Transform')?.properties;
    return composeTransform(properties?.position, properties?.rotation, properties?.scale);
}

/** Named definitions live for the whole placement, including while its cells are cold. */
function cellComponents(node: GameObject, lookup: typeof getComponent) {
    return Object.fromEntries(Object.entries(node.components ?? {}).filter(([, c]) => c && c.type !== 'PrefabRef' && lookup(c.type)?.scope !== 'scene').map(([key, c]) => {
        if (c?.type !== 'Material' || !c.properties.name) return [key, c];
        const { name, attach } = c.properties;
        return [key, { ...c, properties: { name, ...(attach !== undefined && { attach }) } }];
    }));
}

/**
 * Partition immutable visual scenery without mounting Three objects. Transform
 * chains are retained (including shear) and references are expanded.
 * Unknown behavior keeps its complete document resident to preserve references.
 */
export async function createSpatialPrefabPlan(document: PrefabState, runtime: SpatialPlanRuntime,
    options: PrefabStreamingOptions = {}, basePath = '', signal?: AbortSignal,
    yieldWork: () => Promise<void> = yieldToFrame): Promise<SpatialPrefabPlan> {
    const lookup = runtime.lookup ?? getComponent;
    const cellSize = finitePositive(options.cellSize, STREAMING_DEFAULTS.cellSize);
    const limit = Math.max(8, Math.floor(finitePositive(options.maxNodesPerChunk, STREAMING_DEFAULTS.maxNodesPerChunk)));
    signal?.throwIfAborted();
    const key = JSON.stringify([cellSize, limit, !!runtime.batchPrimitives, getComponentRegistryVersion()]);
    let reusable = lookup === getComponent;
    const cached = reusable ? completedPlans.get(document) : undefined;
    if (cached?.key === key) return cached.plan;
    const chunks: SpatialPrefabChunk[] = [];
    const buckets = new Map<string, Bucket>();
    // Mesh/material setup costs more than an empty transform group. Retain a
    // separate renderable cap when sharing ancestor paths frees node capacity.
    const rendererLimit = Math.max(1, Math.floor(limit / 2));
    // Synthetic resident IDs also disambiguate reference paths from authored IDs containing slashes.
    let residentIndex = 0;
    const residentId = (id: string) => `resident-${residentIndex++}/${id}`;
    const materials = new Map<string, PrefabMaterial>();
    const modelBounds = new Map<Object3D, Box3>();
    const root: GameObject = { id: '__stream-root', components: Object.fromEntries(Object.entries(document.nodesById[document.rootId].components ?? {}).filter(([, c]) => c && lookup(c.type)?.scope === 'scene')), children: [] };
    let lastYield = performance.now(), visits = 0;
    const checkpoint = async () => {
        signal?.throwIfAborted();
        if (++visits % 32 === 0 && performance.now() - lastYield >= 3) {
            await yieldWork(); signal?.throwIfAborted(); lastYield = performance.now();
        }
    };
    const reference = (state: PrefabState, properties: Record<string, any>) => {
        if (properties.prefabId) return resolveInlinePrefab(state, properties.prefabId);
        reusable = false;
        const path = withBasePath(basePath, properties.url ?? '');
        const loaded = runtime.getPrefab(path);
        if (!loaded) throw new Error(`Prepared prefab reference is unavailable: ${path}`);
        return loaded;
    };
    // Check behavior across references before splitting anything. Never silently
    // turn off a script, collider, animation, or a cross-node gameplay reference.
    let residentStatic = true;
    const checked = new Set<PrefabState>();
    const checking = new Set<PrefabState>();
    const safe = async (state: PrefabState): Promise<boolean> => {
        if (checking.has(state)) throw new Error('Cyclic prefab reference while spatially partitioning scenery.');
        if (checked.has(state)) return true;
        checking.add(state);
        for (const node of Object.values(state.nodesById)) {
            await checkpoint();
            const components = Object.values(node.components ?? {});
            if (components.filter(c => c?.type === 'Geometry' || c?.type === 'Model' || c?.type === 'PrefabRef').length > 1) return false;
            for (const c of components) {
                if (!c) continue;
                const definition = lookup(c.type);
                if (!definition || !isBuiltInComponent(definition)) return false;
                if (definition.scope === 'scene') {
                    if (c.type !== 'ChunkSettings') residentStatic = false;
                    continue;
                }
                if (!visualTypes.has(c.type)) {
                    if (!residentTypes.has(c.type)) return false;
                    if (!fixedResidentTypes.has(c.type)) residentStatic = false;
                }
                if (c.type === 'Geometry' && !Object.hasOwn(GEOMETRY_ARGS, c.properties.geometryType ?? 'box')) return false;
                if (c.type === 'Material' && c.properties.name && !materials.has(c.properties.name)) {
                    const definition = getMaterialDefinition(c.properties);
                    if (definition) materials.set(c.properties.name, definition);
                }
                if (c.type === 'Model' && c.properties.filename) {
                    reusable = false;
                    const model = runtime.getModel?.(withBasePath(basePath, c.properties.filename));
                    // Animated/skinned models and repeat arrays need their original
                    // lifecycle; a single imported mesh is an indivisible mount unit.
                    if (!model || model.animations.length || c.properties.repeat) return false;
                    if (modelBounds.has(model)) continue;
                    let dynamic = false;
                    model.traverse(object => { if ('isSkinnedMesh' in object || 'isLight' in object || 'isCamera' in object) dynamic = true; });
                    if (dynamic) return false;
                    modelBounds.set(model, new Box3().setFromObject(model));
                }
                if (c.type === 'PrefabRef' && (c.properties.url || c.properties.prefabId) && !await safe(reference(state, c.properties))) return false;
            }
        }
        checking.delete(state); checked.add(state);
        return true;
    };
    if (!await safe(document)) return { chunks, tree: buildChunkTree(chunks), resident: document, residentStatic: false, materials: new Map() };
    const flush = (key: string, bucket: Bucket) => {
        if (!bucket.roots.length) return;
        const id = `${key}/${bucket.part++}`;
        let rootId = `__cell/${id}`;
        while (bucket.nodes.has(rootId)) rootId += '/root';
        const prefab: Prefab = { root: { id: rootId, children: bucket.roots } };
        const batches = bucket.primitives && batchStaticPrimitives(prefab.root, bucket.primitives, materials);
        const document = normalizePrefab(prefab);
        chunks.push({ id, cellKey: key, cullable: bucket.cullable, bounds: bucket.bounds, rendererBounds: bucket.rendererBounds, document, batches });
        bucket.cullable = true; bucket.roots = []; bucket.nodes = new Map(); bucket.bounds = new Box3(); bucket.rendererBounds = [];
        bucket.primitives?.clear();
    };
    const visit = async (state: PrefabState, id: string, ancestors: GameObject[], parentMatrix: Matrix4,
        prefix: string): Promise<GameObject | undefined> => {
        await checkpoint();
        const node = state.nodesById[id];
        if (!node || node.disabled || node.hidden) return;
        const scopedId = `${prefix}${id}`;
        const components = node.components ?? {};
        const values = Object.values(components);
        const world = parentMatrix.clone().multiply(matrixOf(node));
        // Ancestors carry only transforms and metadata, never duplicate renderers or lights.
        const shell: GameObject = { id: scopedId, name: node.name, components: Object.fromEntries(Object.entries(components).filter(([, c]) => c?.type === 'Transform' || c?.type === 'Data')) };
        const localComponents = cellComponents(node, lookup);
        const geometry = values.find(c => c?.type === 'Geometry');
        const model = values.find(c => c?.type === 'Model');
        if (geometry?.properties.visible === false) return;
        const residents = Object.entries(localComponents).filter(([, c]) => c && residentTypes.has(c.type));
        if (residents.some(([, c]) => lookup(c!.type)?.slot !== 'leaf')) {
            // A resident wrapper owns its subtree, including Environment's capture scene.
            const copy = (sourceState: PrefabState, childId: string, scope: string): GameObject => {
                const source = sourceState.nodesById[childId];
                const children = (sourceState.childIdsById[childId] ?? []).map(next => copy(sourceState, next, scope));
                for (const c of Object.values(source.components ?? {})) if (c?.type === 'PrefabRef' && (c.properties.url || c.properties.prefabId)) {
                    const external = reference(sourceState, c.properties);
                    children.push(copy(external, external.rootId, `${scope}${childId}/`));
                }
                return { ...source, packed: undefined, id: residentId(`${scope}${childId}`), components: cellComponents(source, lookup), children };
            };
            return copy(state, id, prefix);
        }
        for (const [key] of residents) delete localComponents[key];
        const modelSource = model?.properties.filename && model.properties.visible !== false
            ? runtime.getModel?.(withBasePath(basePath, model.properties.filename)) : null;
        if (geometry || modelSource) {
            const bounds = geometry ? primitiveBounds(geometry.properties)
                : modelBounds.get(modelSource!)!.clone();
            bounds.applyMatrix4(world);
            const center = bounds.getCenter(new Vector3());
            const key = looseOctreeKey(bounds, center, cellSize);
            let bucket = buckets.get(key);
            if (!bucket) buckets.set(key, bucket = {
                cullable: true, roots: [], nodes: new Map(), bounds: new Box3(), rendererBounds: [], part: 0,
                primitives: runtime.batchPrimitives ? new Map() : undefined,
            });
            const chain = [...ancestors, { id: scopedId, name: node.name, components: localComponents }];
            let cost = 0;
            for (const part of chain) if (!bucket.nodes.has(part.id)) cost++;
            if (bucket.nodes.size + cost + 1 > limit || bucket.rendererBounds.length >= rendererLimit) flush(key, bucket);
            // Imported models can have custom bounds or per-mesh culling overrides.
            if (modelSource || geometry?.properties.frustumCulled === false) bucket.cullable = false;
            let siblings = bucket.roots;
            for (let index = 0; index < chain.length; index++) {
                const part = chain[index];
                let shared = bucket.nodes.get(part.id);
                if (!shared) {
                    shared = { ...part, children: [] };
                    bucket.nodes.set(part.id, shared); siblings.push(shared);
                } else if (index === chain.length - 1) {
                    // This path may already be an ancestor shell of another mesh.
                    shared.components = part.components;
                }
                if (geometry && index === chain.length - 1) bucket.primitives?.set(shared, world);
                siblings = shared.children!;
            }
            bucket.bounds.union(bounds); bucket.rendererBounds.push(bounds);
        }
        const nextAncestors = [...ancestors, shell];
        const children: GameObject[] = [];
        for (const c of values) if (c?.type === 'PrefabRef' && (c.properties.url || c.properties.prefabId)) {
            const external = reference(state, c.properties);
            const child = await visit(external, external.rootId, nextAncestors, world, `${scopedId}/`);
            if (child) children.push(child);
        }
        for (const childId of state.childIdsById[id] ?? []) {
            const child = await visit(state, childId, nextAncestors, world, prefix);
            if (child) children.push(child);
        }
        if (residents.length || children.length) {
            return { ...shell, id: residentId(scopedId), components: { ...shell.components, ...Object.fromEntries(residents) }, children };
        }
    };
    const residentRoot = await visit(document, document.rootId, [], new Matrix4(), '');
    for (const [key, bucket] of buckets) { await checkpoint(); flush(key, bucket); }
    if (residentRoot) root.children = [residentRoot];
    const plan = { chunks, tree: buildChunkTree(chunks), resident: normalizePrefab({ root }), residentStatic, materials };
    if (reusable && chunks.length) completedPlans.set(document, { key, plan });
    return plan;
}
