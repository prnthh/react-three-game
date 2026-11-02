import { Box3, Matrix4, Vector3, type Object3D } from 'three';
import { normalizePrefab, type PrefabState } from '../../core/prefab.js';
import { getComponent } from '../../core/ComponentRegistry.js';
import { findComponent, type GameObject, type Prefab, type PrefabMaterial } from '../../core/types.js';
import { composeTransform } from '../../core/transforms.js';
import { resolveInlinePrefab } from '../../core/inlinePrefabs.js';
import { spatialCellKey } from '../spatial/spatialCell.js';
import { withBasePath } from '../assets/assetPaths.js';

export interface PrefabStreamingOptions {
    /** Spatial partition width in prefab-local units. */
    cellSize?: number;
    /** Ready chunks become visible inside this world-space distance from their bounds. */
    visibleDistance?: number;
    /** Prepare ahead of the visible range. */
    preloadDistance?: number;
    /** Release mounted chunks outside this range. Shared source assets remain cached. */
    unloadDistance?: number;
    /** Cap each React mount/unmount unit, including copied transform ancestors. */
    maxNodesPerChunk?: number;
}

export const STREAMING_DEFAULTS: Required<PrefabStreamingOptions> = {
    cellSize: 64, visibleDistance: 160, preloadDistance: 220, unloadDistance: 280, maxNodesPerChunk: 96,
};

export interface SpatialPrefabChunk {
    id: string;
    bounds: Box3;
    document: PrefabState;
    nodeCount: number;
}
export interface SpatialPrefabPlan { chunks: SpatialPrefabChunk[]; resident: PrefabState; }
type Bucket = { roots: GameObject[]; nodes: Map<string, GameObject>; bounds: Box3; renderers: number; part: number };
export interface SpatialPlanRuntime {
    getPrefab(path: string): PrefabState | null;
    getModel?(path: string): Object3D | null;
}

const visualTypes = new Set(['Transform', 'Geometry', 'Material', 'Data', 'PrefabRef', 'Model']);
// These components pass children through without changing their render context.
// Keep their settings resident while allowing child scenery to stream normally.
const residentSettings = new Set(['DiffuseLightProbe', 'Fog', 'AmbientLight']);
// Other residents retain their subtree: Environment, for example, renders its
// children into a capture scene rather than the main scene.
const residentTypes = new Set([...residentSettings, 'PointLight', 'SpotLight', 'DirectionalLight', 'HemisphereLight', 'Camera', 'Environment', 'Sky']);
const yieldFrame = () => new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'undefined') setTimeout(resolve, 0);
    else requestAnimationFrame(() => setTimeout(resolve, 0));
});

function matrixOf(node: GameObject) {
    const properties = findComponent(node, 'Transform')?.properties;
    return composeTransform(properties?.position, properties?.rotation, properties?.scale);
}

/** Resolve named surfaces before either a resident branch or a cell is copied. */
function resolvedComponents(node: GameObject, materials: Record<string, PrefabMaterial>) {
    return Object.fromEntries(Object.entries(node.components ?? {}).filter(([, c]) => c && c.type !== 'PrefabRef' && getComponent(c.type)?.scope !== 'scene').map(([key, c]) => {
        if (c?.type !== 'Material') return [key, c];
        const { name, ...properties } = { ...(materials[c.properties.name] ?? {}), ...c.properties };
        return [key, { ...c, properties }];
    }));
}

/** Conservative primitive bounds; oversized meshes are assigned once and selected by bounds, never by center alone. */
function geometryBounds(type = 'box', args: number[] = []) {
    let x = 0.5, y = 0.5, z = 0.5;
    if (type === 'box' || type === 'plane') {
        x = (args[0] ?? 1) / 2; y = (args[1] ?? 1) / 2; z = type === 'plane' ? 0 : (args[2] ?? 1) / 2;
    } else if (type === 'sphere') x = y = z = args[0] ?? 1;
    else if (type === 'cylinder') { x = z = Math.max(args[0] ?? 1, args[1] ?? 1); y = (args[2] ?? 1) / 2; }
    else if (type === 'torus') { x = y = (args[0] ?? 1) + (args[1] ?? 0.4); z = args[1] ?? 0.4; }
    else throw new Error(`Cannot spatially partition geometry type "${type}".`);
    return new Box3(new Vector3(-x, -y, -z), new Vector3(x, y, z));
}

/**
 * Partition immutable visual scenery without mounting Three objects. Transform
 * chains are retained (including shear), references are expanded, and named
 * materials are resolved before a distant defining mesh can be unloaded.
 * Unknown behavior keeps its complete document resident to preserve references.
 */
export async function createSpatialPrefabPlan(document: PrefabState, runtime: SpatialPlanRuntime,
    options: PrefabStreamingOptions = {}, basePath = '', signal?: AbortSignal,
    yieldWork: () => Promise<void> = yieldFrame): Promise<SpatialPrefabPlan> {
    const cellSize = finitePositive(options.cellSize, STREAMING_DEFAULTS.cellSize);
    const limit = Math.max(8, Math.floor(finitePositive(options.maxNodesPerChunk, STREAMING_DEFAULTS.maxNodesPerChunk)));
    const chunks: SpatialPrefabChunk[] = [];
    const buckets = new Map<string, Bucket>();
    // Mesh/material setup costs more than an empty transform group. Retain a
    // separate renderable cap when sharing ancestor paths frees node capacity.
    const rendererLimit = Math.max(1, Math.floor(limit / 2));
    const resident: GameObject[] = [];
    const modelBounds = new Map<Object3D, Box3>();
    const root: GameObject = { id: '__stream-root', components: Object.fromEntries(Object.entries(document.nodesById[document.rootId].components ?? {}).filter(([, c]) => c && getComponent(c.type)?.scope === 'scene')), children: resident };
    let lastYield = performance.now(), visits = 0;
    const checkpoint = async () => {
        signal?.throwIfAborted();
        if (++visits % 32 === 0 && performance.now() - lastYield >= 3) {
            await yieldWork(); signal?.throwIfAborted(); lastYield = performance.now();
        }
    };
    const reference = (state: PrefabState, properties: Record<string, any>) => {
        if (properties.prefabId) return resolveInlinePrefab(state, properties.prefabId);
        const path = withBasePath(basePath, properties.url ?? '');
        const loaded = runtime.getPrefab(path);
        if (!loaded) throw new Error(`Prepared prefab reference is unavailable: ${path}`);
        return loaded;
    };
    // Check behavior across references before splitting anything. Never silently
    // turn off a script, collider, animation, or a cross-node gameplay reference.
    const checked = new Set<PrefabState>();
    const checking = new Set<PrefabState>();
    const safe = async (state: PrefabState): Promise<boolean> => {
        if (checking.has(state)) throw new Error('Cyclic prefab reference while spatially partitioning scenery.');
        if (checked.has(state)) return true;
        checking.add(state);
        for (const node of Object.values(state.nodesById)) {
            await checkpoint();
            const renderers = Object.values(node.components ?? {}).filter(c => c && ['Geometry', 'Model', 'PrefabRef'].includes(c.type));
            if (renderers.length > 1) return false;
            for (const c of Object.values(node.components ?? {})) {
                if (!c || getComponent(c.type)?.scope === 'scene') continue;
                if (!visualTypes.has(c.type) && !residentTypes.has(c.type)) return false;
                if (c.type === 'Geometry' && !['box', 'plane', 'sphere', 'cylinder', 'torus'].includes(c.properties.geometryType ?? 'box')) return false;
                if (c.type === 'Model' && c.properties.filename) {
                    const model = runtime.getModel?.(withBasePath(basePath, c.properties.filename));
                    // Animated/skinned models and repeat arrays need their original
                    // lifecycle; a single imported mesh is an indivisible mount unit.
                    if (!model || model.animations.length || c.properties.repeat) return false;
                    let dynamic = false;
                    model.traverse(object => { if ('isSkinnedMesh' in object || 'isLight' in object || 'isCamera' in object) dynamic = true; });
                    if (dynamic) return false;
                    if (!modelBounds.has(model)) modelBounds.set(model, new Box3().setFromObject(model));
                }
                if (c.type === 'PrefabRef' && (c.properties.url || c.properties.prefabId) && !await safe(reference(state, c.properties))) return false;
            }
        }
        checking.delete(state); checked.add(state);
        return true;
    };
    if (!await safe(document)) return { chunks, resident: document };
    const flush = (key: string, bucket: Bucket) => {
        if (!bucket.roots.length) return;
        const id = `${key}/${bucket.part++}`;
        let rootId = `__cell/${id}`;
        while (bucket.nodes.has(rootId)) rootId += '/root';
        const prefab: Prefab = { root: { id: rootId, children: bucket.roots } };
        chunks.push({ id, bounds: bucket.bounds, nodeCount: bucket.nodes.size + 1, document: normalizePrefab(prefab) });
        bucket.roots = []; bucket.nodes = new Map(); bucket.bounds = new Box3(); bucket.renderers = 0;
    };
    const wrap = (node: GameObject, ancestors: GameObject[]) => ancestors.reduceRight((child, parent) => ({ ...parent, children: [child] }), node);
    const visit = async (state: PrefabState, id: string, ancestors: GameObject[], parentMatrix: Matrix4,
        prefix: string, inheritedMaterials: Record<string, PrefabMaterial>) => {
        await checkpoint();
        const node = state.nodesById[id];
        if (!node || node.disabled || node.hidden) return;
        const scopedId = `${prefix}${id}`;
        const components = Object.fromEntries(Object.entries(node.components ?? {}).filter(([, c]) => c));
        const values = Object.values(components);
        const world = parentMatrix.clone().multiply(matrixOf(node));
        const materials = { ...inheritedMaterials, ...state.materials };
        // Ancestors carry only transforms and metadata, never duplicate renderers or lights.
        const shell: GameObject = { id: scopedId, name: node.name, components: Object.fromEntries(Object.entries(components).filter(([, c]) => c?.type === 'Transform' || c?.type === 'Data')) };
        const localComponents = resolvedComponents(node, materials);
        const geometry = values.find(c => c?.type === 'Geometry');
        const model = values.find(c => c?.type === 'Model');
        if (geometry?.properties.visible === false) return;
        const hasResident = values.some(c => c && residentTypes.has(c.type) && !residentSettings.has(c.type));
        if (hasResident) {
            // A node that also carries a light stays intact, including its descendants.
            const copy = (sourceState: PrefabState, childId: string, scope: string, inherited: Record<string, PrefabMaterial>): GameObject => {
                const source = sourceState.nodesById[childId];
                const definitions = { ...inherited, ...sourceState.materials };
                const resolved = resolvedComponents(source, definitions);
                const children = (sourceState.childIdsById[childId] ?? []).map(next => copy(sourceState, next, scope, definitions));
                for (const c of Object.values(source.components ?? {})) if (c?.type === 'PrefabRef' && (c.properties.url || c.properties.prefabId)) {
                    const external = reference(sourceState, c.properties);
                    children.push(copy(external, external.rootId, `${scope}${childId}/`, definitions));
                }
                return { ...source, packed: undefined, id: `${scope}${childId}`, components: resolved, children };
            };
            resident.push(wrap(copy(state, id, prefix, materials), ancestors));
            return;
        }
        const settings = Object.fromEntries(Object.entries(localComponents).filter(([, c]) => c && residentSettings.has(c.type)));
        if (Object.keys(settings).length) {
            resident.push(wrap({ ...shell, components: { ...shell.components, ...settings } }, ancestors));
            for (const key of Object.keys(settings)) delete localComponents[key];
        }
        const modelSource = model?.properties.filename && model.properties.visible !== false
            ? runtime.getModel?.(withBasePath(basePath, model.properties.filename)) : null;
        if (geometry || modelSource) {
            const bounds = geometry ? geometryBounds(geometry.properties.geometryType, geometry.properties.args)
                : modelBounds.get(modelSource!)!.clone();
            bounds.applyMatrix4(world);
            const center = bounds.getCenter(new Vector3());
            const key = spatialCellKey(center, cellSize);
            let bucket = buckets.get(key);
            if (!bucket) buckets.set(key, bucket = { roots: [], nodes: new Map(), bounds: new Box3(), renderers: 0, part: 0 });
            const chain = [...ancestors, { id: scopedId, name: node.name, components: localComponents }];
            const cost = chain.filter(part => !bucket.nodes.has(part.id)).length;
            if (bucket.nodes.size + cost + 1 > limit || bucket.renderers >= rendererLimit) flush(key, bucket);
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
                siblings = shared.children!;
            }
            bucket.bounds.union(bounds); bucket.renderers++;
        }
        const nextAncestors = [...ancestors, shell];
        for (const c of values) if (c?.type === 'PrefabRef' && (c.properties.url || c.properties.prefabId)) {
            const external = reference(state, c.properties);
            await visit(external, external.rootId, nextAncestors, world, `${scopedId}/`, materials);
        }
        for (const childId of state.childIdsById[id] ?? []) await visit(state, childId, nextAncestors, world, prefix, materials);
    };
    await visit(document, document.rootId, [], new Matrix4(), '', {});
    for (const [key, bucket] of buckets) { await checkpoint(); flush(key, bucket); }
    // Resident branches can share ancestors too; give each branch its own scope.
    const renameResident = (node: GameObject, index: number): GameObject => ({ ...node, id: `resident-${index}/${node.id}`, children: node.children?.map(child => renameResident(child, index)) });
    root.children = resident.map(renameResident);
    return { chunks, resident: normalizePrefab({ root }) };
}

export function finitePositive(value: number | undefined, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
