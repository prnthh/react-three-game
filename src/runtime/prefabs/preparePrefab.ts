import type { Component } from '../../core/ComponentRegistry.js';
import { resolveComponentProperties } from '../../core/ComponentRegistry.js';
import type { PrefabState } from '../../core/prefab.js';
import type { Prefab } from '../../core/types.js';
import { resolveInlinePrefab } from '../../core/inlinePrefabs.js';
import { withBasePath } from '../assets/assetPaths.js';
import { describePrefabSource } from './prefabSource.js';
import type { AssetDependency } from '../../core/dependencies.js';

export interface PreparedPrefab {
    readonly document: PrefabState;
    readonly documentCount: number;
    readonly assetCount: number;
    readonly durationMs: number;
}
export interface PrefabPreparationOptions { basePath?: string; signal?: AbortSignal; }
export interface PrefabPreparationRuntime {
    getComponent(name: string): Component | undefined;
    loadDocument(path: string): Promise<PrefabState>;
    loadAsset(dependency: AssetDependency): Promise<unknown>;
}

/** Resolve inline and URL definitions through one dependency graph before activation. */
export async function preparePrefab(
    runtime: PrefabPreparationRuntime,
    path: string,
    { basePath = '', signal }: PrefabPreparationOptions = {},
): Promise<PreparedPrefab> {
    const started = performance.now();
    type Source = string | Prefab;
    const documents = new Map<Source, Promise<PrefabState>>();
    const assets = new Map<string, Promise<unknown>>();
    const edges = new Map<Source, Source[]>();
    const queue: Source[] = [];
    const describe = (source: Source) => typeof source === 'string' ? describePrefabSource(source) : source.name ?? source.id ?? 'inline prefab';
    const check = () => {
        if (signal?.aborted) throw signal.reason ?? new Error('Prefab preparation cancelled');
    };
    const enqueue = (source: Source, inline?: PrefabState) => {
        check();
        if (documents.has(source)) return;
        const ready = inline ? Promise.resolve(inline) : runtime.loadDocument(source as string);
        documents.set(source, ready);
        void ready.catch(() => {});
        queue.push(source);
    };
    const enqueueAsset = (dependency: AssetDependency) => {
        check();
        const resolved = { ...dependency, path: withBasePath(basePath, dependency.path) };
        const key = `${resolved.kind}:${resolved.path}`;
        if (assets.has(key)) return;
        const ready = runtime.loadAsset(resolved);
        assets.set(key, ready);
        void ready.catch(() => {});
    };
    const rootUrl = withBasePath(basePath, path);
    const run = async () => {
        enqueue(rootUrl);
        while (queue.length) {
            await Promise.all(queue.splice(0).map(async source => {
                const document = await documents.get(source)!;
                check();
                const references: Source[] = [];
                edges.set(source, references);
                for (const node of Object.values(document.nodesById)) {
                    for (const component of Object.values(node.components ?? {})) {
                        if (!component) continue;
                        const definition = runtime.getComponent(component.type);
                        if (!definition) throw new Error(`Unknown component "${component.type}" in ${describe(source)}, node "${node.id}"`);
                        const properties = resolveComponentProperties(definition, component.properties);
                        if (component.type === 'PrefabRef' && properties.prefabId) {
                            const inline = resolveInlinePrefab(document, properties.prefabId);
                            const next = document.prefabs![properties.prefabId];
                            references.push(next);
                            enqueue(next, inline);
                        }
                        for (const dependency of definition.dependencies?.(properties) ?? []) {
                            if (!dependency.path) continue;
                            if (dependency.kind === 'prefab') {
                                const next = withBasePath(basePath, dependency.path);
                                references.push(next);
                                enqueue(next);
                            } else enqueueAsset(dependency);
                        }
                    }
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
        validate(rootUrl);
        await Promise.all(assets.values());
        check();
        return {
            document: await documents.get(rootUrl)!, documentCount: documents.size,
            assetCount: assets.size, durationMs: performance.now() - started,
        };
    };
    let onAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal?.reason ?? new Error('Prefab preparation cancelled'));
        signal?.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([run(), cancelled]); }
    finally { signal?.removeEventListener('abort', onAbort); }
}
