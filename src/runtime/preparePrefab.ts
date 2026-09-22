import type { Component } from '../tools/prefabeditor/components/ComponentRegistry';
import { resolveComponentProperties } from '../tools/prefabeditor/components/ComponentRegistry';
import type { PrefabState } from '../tools/prefabeditor/prefab';
import { withBasePath } from '../tools/prefabeditor/runtimeUtils';
import type { ResourceLease } from './ResourceCache';

export type AssetDependency = { kind: 'model' | 'texture' | 'sound'; path: string };
export type ComponentDependency = AssetDependency | { kind: 'prefab'; path: string };

export interface PreparedPrefab {
    readonly document: PrefabState;
    readonly documentCount: number;
    readonly assetCount: number;
    readonly durationMs: number;
    /** Keep the lease for the lifetime of the instance. Idempotent. */
    release(): void;
}
export interface PrefabPreparationOptions { basePath?: string; signal?: AbortSignal; }
export interface PrefabPreparationRuntime {
    getComponent(name: string): Component | undefined;
    acquireDocument(path: string): ResourceLease<PrefabState>;
    acquireAsset(dependency: AssetDependency): ResourceLease<unknown>;
}

/** Discover and retain dependencies before creating live React/Three objects. */
export async function preparePrefab(
    runtime: PrefabPreparationRuntime,
    path: string,
    { basePath = '', signal }: PrefabPreparationOptions = {},
): Promise<PreparedPrefab> {
    const started = performance.now();
    const leases: ResourceLease<unknown>[] = [];
    const documents = new Map<string, Promise<PrefabState>>();
    const assets = new Map<string, Promise<unknown>>();
    const edges = new Map<string, string[]>();
    const queue: string[] = [];
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        leases.forEach(lease => lease.release());
    };
    const check = () => {
        if (signal?.aborted) throw signal.reason ?? new Error('Prefab preparation cancelled');
        if (released) throw new Error('Prefab preparation released');
    };
    const enqueue = (url: string) => {
        check();
        if (documents.has(url)) return;
        const lease = runtime.acquireDocument(url);
        leases.push(lease);
        documents.set(url, lease.ready);
        void lease.ready.catch(() => {});
        queue.push(url);
    };
    const retainAsset = (dependency: AssetDependency) => {
        check();
        const resolved = { ...dependency, path: withBasePath(basePath, dependency.path) };
        const key = `${resolved.kind}:${resolved.path}`;
        if (assets.has(key)) return;
        const lease = runtime.acquireAsset(resolved);
        leases.push(lease);
        assets.set(key, lease.ready);
        void lease.ready.catch(() => {});
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
                    if (material.texture) retainAsset({ kind: 'texture', path: material.texture });
                    if (material.normalMapTexture) retainAsset({ kind: 'texture', path: material.normalMapTexture });
                }
                for (const node of Object.values(document.nodesById)) {
                    for (const component of Object.values(node.components ?? {})) {
                        if (!component) continue;
                        const definition = runtime.getComponent(component.type);
                        if (!definition) throw new Error(`Unknown component "${component.type}" in ${url}, node "${node.id}"`);
                        const properties = resolveComponentProperties(definition, component.properties);
                        for (const dependency of definition.dependencies?.(properties) ?? []) {
                            if (!dependency.path) continue;
                            if (dependency.kind === 'prefab') {
                                const next = withBasePath(basePath, dependency.path);
                                references.push(next);
                                enqueue(next);
                            } else retainAsset(dependency);
                        }
                    }
                }
            }));
        }
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const validate = (url: string) => {
            if (visiting.has(url)) throw new Error(`Cyclic prefab reference: ${[...visiting, url].join(' -> ')}`);
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
            assetCount: assets.size, durationMs: performance.now() - started, release,
        };
    };
    let onAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => { release(); reject(signal?.reason ?? new Error('Prefab preparation cancelled')); };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
        return await Promise.race([run(), cancelled]);
    } catch (error) {
        release();
        throw error;
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}
