import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Material } from 'three';
import type { Node } from 'three/webgpu';
import type { PrefabMaterial } from '../../core/types.js';
import { registerInstancedMaterial } from './materialInstancing.js';
import { useInvalidateMeshInstances } from './MeshInstanceProvider.js';

type MaterialEntry = {
    key: string;
    material: Material;
    references: number;
};

type MaterialDefinition = { material: PrefabMaterial; basePath: string };

export class SceneMaterialPool {
    private entries = new Map<string, MaterialEntry>();
    private definitionsByName = new Map<string, Map<object, MaterialDefinition>>();
    lifetime: object | null = null;
    private listeners = new Map<string, Set<() => void>>();
    subscribe(name: string, listener: () => void) {
        let listeners = this.listeners.get(name);
        if (!listeners) this.listeners.set(name, listeners = new Set());
        listeners.add(listener);
        return () => {
            listeners?.delete(listener);
            if (listeners?.size === 0) this.listeners.delete(name);
        };
    }
    private notify(name: string) { this.listeners.get(name)?.forEach(listener => listener()); }
    registerDefinition(owner: object, name: string, material: PrefabMaterial, basePath: string) {
        let peers = this.definitionsByName.get(name);
        if (!peers) this.definitionsByName.set(name, peers = new Map());
        const previous = peers.get(owner);
        if (previous?.material === material && previous.basePath === basePath) return;
        peers.set(owner, { material, basePath });
        if (peers.keys().next().value === owner) this.notify(name);
    }
    unregisterDefinition(owner: object, name: string) {
        const peers = this.definitionsByName.get(name);
        const previous = peers?.get(owner);
        if (!peers || !previous) return;
        const active = peers.keys().next().value === owner;
        peers.delete(owner);
        if (!peers.size) this.definitionsByName.delete(name);
        if (!active) return;
        const next = peers.entries().next().value;
        if (next && next[1].material === previous.material && next[1].basePath === previous.basePath) {
            // Repeated placements share a plan. Preserve the subscribers' snapshot on ownership transfer.
            peers.set(next[0], previous);
            return;
        }
        this.notify(name);
    }
    resolve(name: string) {
        return this.definitionsByName.get(name)?.values().next().value ?? null;
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
            if (entry.references > 0) return;
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

function useMaterialPool() {
    const pool = useContext(SceneMaterialPoolContext);
    if (!pool) throw new Error('Materials require a scene material pool');
    return pool;
}

export function MaterialPoolProvider({ children }: { children: ReactNode }) {
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

/** Keep definitions discovered in a streamed prefab available across cell mounts. */
export function useStreamedMaterialDefinitions(materials: ReadonlyMap<string, PrefabMaterial>, basePath = '') {
    const pool = useMaterialPool();
    useLayoutEffect(() => {
        const owner = {};
        for (const [name, material] of materials) pool.registerDefinition(owner, name, material, basePath);
        return () => { for (const name of materials.keys()) pool.unregisterDefinition(owner, name); };
    }, [pool, materials, basePath]);
}

export type SharedMaterialOptions<T extends Material> = {
    /** Optional shader variant for object-local calculations in an instance batch.
     * Return a new material; the renderer owns its disposal. Never mutate source.
     * Include every shader dependency in the resource key, just as for create(). */
    createInstanced?: (source: T, inverseInstanceMatrix: Node<'mat4'>) => Material;
};

/** Immutable materials are shared by key; resource changes automatically refresh batches. */
export function useSharedMaterialResource<T extends Material>(key: string, create: () => T, options?: SharedMaterialOptions<T>): T {
    const pool = useMaterialPool();
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

export function useNamedMaterialDefinition(name: string, material: PrefabMaterial | null, basePath: string) {
    const pool = useMaterialPool();
    const [owner] = useState(() => ({}));
    const subscribe = useMemo(() => (listener: () => void) => pool.subscribe(name, listener), [pool, name]);
    const resolve = useMemo(() => () => pool.resolve(name), [pool, name]);
    const definition = useSyncExternalStore(subscribe, resolve, () => null);
    useLayoutEffect(() => {
        if (material) pool.registerDefinition(owner, name, material, basePath);
        else pool.unregisterDefinition(owner, name);
    }, [pool, owner, name, material, basePath]);
    useLayoutEffect(() => () => pool.unregisterDefinition(owner, name), [pool, owner, name]);
    return definition;
}
