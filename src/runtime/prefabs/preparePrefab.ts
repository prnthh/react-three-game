import type { Component } from '../../core/ComponentRegistry';
import { resolveComponentProperties } from '../../core/ComponentRegistry';
import type { PrefabState } from '../../core/prefab';
import { withBasePath } from "../assets/assetPaths";
import { describePrefabSource } from './prefabSource';

import type { AssetDependency } from '../../core/dependencies';

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

/** Discover and load dependencies through the shared loader cache before mounting. */
export async function preparePrefab(
    runtime: PrefabPreparationRuntime,
    path: string,
    { basePath = '', signal }: PrefabPreparationOptions = {},
): Promise<PreparedPrefab> {
    const started = performance.now();
    const documents = new Map<string, Promise<PrefabState>>();
    const assets = new Map<string, Promise<unknown>>();
    const edges = new Map<string, string[]>();
    const queue: string[] = [];
    const check = () => {
        if (signal?.aborted) throw signal.reason ?? new Error('Prefab preparation cancelled');
    };
    const enqueue = (url: string) => {
        check();
        if (documents.has(url)) return;
        const ready = runtime.loadDocument(url);
        documents.set(url, ready);
        void ready.catch(() => {});
        queue.push(url);
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
        // Breadth-first discovery avoids cached recursive promises deadlocking on cycles.
        while (queue.length) {
            await Promise.all(queue.splice(0).map(async url => {
                const document = await documents.get(url)!;
                check();
                const references: string[] = [];
                edges.set(url, references);
                for (const material of Object.values(document.materials)) {
                    if (material.texture) enqueueAsset({ kind: 'texture', path: material.texture });
                    if (material.normalMapTexture) enqueueAsset({ kind: 'texture', path: material.normalMapTexture });
                }
                for (const node of Object.values(document.nodesById)) {
                    for (const component of Object.values(node.components ?? {})) {
                        if (!component) continue;
                        const definition = runtime.getComponent(component.type);
                        if (!definition) throw new Error(`Unknown component "${component.type}" in ${describePrefabSource(url)}, node "${node.id}"`);
                        const properties = resolveComponentProperties(definition, component.properties);
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
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const validate = (url: string) => {
            if (visiting.has(url)) throw new Error(`Cyclic prefab reference: ${[...visiting, url].map(describePrefabSource).join(' -> ')}`);
            if (visited.has(url)) return;
            visiting.add(url);
            for (const next of edges.get(url) ?? []) validate(next);
            visiting.delete(url);
            visited.add(url);
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
    try {
        return await Promise.race([run(), cancelled]);
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}
