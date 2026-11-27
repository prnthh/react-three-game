import { getComponent, getComponentRegistryVersion, resolveComponentProperties, type Component } from '../../core/ComponentRegistry.js';
import type { PrefabState } from '../../core/prefab.js';
import type { Prefab } from '../../core/types.js';
import { resolveInlinePrefab } from '../../core/inlinePrefabs.js';
import { withBasePath } from '../assets/assetPaths.js';
import { materialTextureDependencies, type AssetDependency, type ComponentDependency } from '../../core/dependencies.js';

export interface PrefabPreparationOptions {
    basePath?: string;
    signal?: AbortSignal;
    /** Let streamed material views request their textures when their cell mounts. */
    deferMaterialTextures?: (root: PrefabState) => boolean;
}
export interface PrefabPreparationRuntime {
    getComponent(name: string): Component | undefined;
    loadDocument(path: string): Promise<PrefabState>;
    loadModel(path: string): Promise<unknown>;
    loadTexture(path: string): Promise<unknown>;
    loadSound(path: string): Promise<unknown>;
}

type Dependency = ComponentDependency | { kind: 'inline'; path: string };
const dependencies = new WeakMap<PrefabState, { version: number; eager?: Dependency[]; streamed?: Dependency[] }>();

function documentDependencies(document: PrefabState, runtime: PrefabPreparationRuntime, deferTextures: boolean, source: string) {
    const version = getComponentRegistryVersion();
    const mode = deferTextures ? 'streamed' : 'eager';
    const cached = runtime.getComponent === getComponent ? dependencies.get(document) : undefined;
    if (cached?.version === version && cached[mode]) return cached[mode];

    const unique = new Map<string, Dependency>();
    for (const node of Object.values(document.nodesById)) {
        for (const component of Object.values(node.components ?? {})) {
            if (!component) continue;
            const definition = runtime.getComponent(component.type);
            if (!definition) throw new Error(`Unknown component "${component.type}" in ${source}, node "${node.id}"`);
            if (!definition.dependencies && component.type !== 'PrefabRef') continue;
            const defer = deferTextures && component.type === 'Material';
            if (defer && definition.dependencies === materialTextureDependencies) continue;
            const properties = resolveComponentProperties(definition, component.properties);
            if (component.type === 'PrefabRef' && properties.prefabId) {
                unique.set('inline:' + properties.prefabId, { kind: 'inline', path: properties.prefabId });
            }
            for (const dep of definition.dependencies?.(properties) ?? []) {
                if (dep.path && !(defer && dep.kind === 'texture')) unique.set(dep.kind + ':' + dep.path, dep);
            }
        }
    }
    const result = [...unique.values()];
    if (runtime.getComponent === getComponent) {
        const entry = cached?.version === version ? cached : { version };
        entry[mode] = result;
        dependencies.set(document, entry);
    }
    return result;
}

/** Resolve inline and URL definitions through one dependency graph before activation. */
export async function preparePrefab(
    runtime: PrefabPreparationRuntime,
    path: string | PrefabState,
    { basePath = '', signal, deferMaterialTextures }: PrefabPreparationOptions = {},
): Promise<PrefabState> {
    type Source = string | Prefab | PrefabState;
    const assets = new Map<string, Promise<unknown>>();
    const edges = new Map<Source, Set<Source>>();
    const queue: { source: Source; ready: Promise<PrefabState> }[] = [];
    const describe = (source: Source) => typeof source === 'string' ? source : 'rootId' in source ? source.prefabName ?? source.rootId : source.name ?? source.id ?? 'inline prefab';
    const enqueue = (source: Source, inline?: PrefabState) => {
        signal?.throwIfAborted();
        if (edges.has(source)) return;
        edges.set(source, new Set());
        const ready = inline ? Promise.resolve(inline) : runtime.loadDocument(source as string);
        void ready.catch(() => {});
        queue.push({ source, ready });
    };
    const enqueueAsset = (dependency: AssetDependency) => {
        signal?.throwIfAborted();
        const path = withBasePath(basePath, dependency.path);
        const key = `${dependency.kind}:${path}`;
        if (assets.has(key)) return;
        const ready = dependency.kind === 'model' ? runtime.loadModel(path)
            : dependency.kind === 'texture' ? runtime.loadTexture(path)
            : runtime.loadSound(path);
        assets.set(key, ready);
        void ready.catch(() => {});
    };
    const rootSource = typeof path === 'string' ? withBasePath(basePath, path) : path;
    const run = async () => {
        signal?.throwIfAborted();
        const root = typeof rootSource === 'string' ? await runtime.loadDocument(rootSource) : rootSource;
        enqueue(rootSource, root);
        const deferTextures = deferMaterialTextures?.(root);
        while (queue.length) {
            await Promise.all(queue.splice(0).map(async ({ source, ready }) => {
                const document = await ready;
                signal?.throwIfAborted();
                const references = edges.get(source)!;
                for (const dep of documentDependencies(document, runtime, !!deferTextures, describe(source))) {
                    if (dep.kind === 'inline') {
                        const inline = resolveInlinePrefab(document, dep.path);
                        const next = document.prefabs![dep.path];
                        references.add(next);
                        enqueue(next, inline);
                    } else if (dep.kind === 'prefab') {
                        const next = withBasePath(basePath, dep.path);
                        references.add(next);
                        enqueue(next);
                    } else enqueueAsset(dep);
                }
            }));
        }
        const visited = new Set<Source>();
        const visiting = new Set<Source>();
        const validate = (source: Source) => {
            if (visiting.has(source)) throw new Error(`Cyclic prefab reference: ${[...visiting, source].map(describe).join(' -> ')}`);
            if (visited.has(source)) return;
            visiting.add(source);
            for (const next of edges.get(source) ?? []) validate(next);
            visiting.delete(source);
            visited.add(source);
        };
        validate(rootSource);
        await Promise.all(assets.values());
        signal?.throwIfAborted();
        return root;
    };
    let onAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal?.reason ?? new Error('Prefab preparation cancelled'));
        signal?.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([run(), cancelled]); }
    finally { signal?.removeEventListener('abort', onAbort); }
}
