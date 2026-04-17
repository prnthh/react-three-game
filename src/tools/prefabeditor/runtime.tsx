import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Object3D, Texture } from "three";

import { getComponentDef } from "./components/ComponentRegistry";
import type { PrefabStoreApi } from "./prefabStore";
import { createScene, type EntityComponent, type Scene } from "./scene";

// ------- Runtime contexts -------

export interface AssetRuntime {
    registerRigidBodyRef: (id: string, rb: any) => void;
    getModel: (path: string) => Object3D | null;
    getTexture: (path: string) => Texture | null;
    getSound: (path: string) => AudioBuffer | null;
    getAssetRevision: () => string;
    getObject: (id: string) => Object3D | null;
    getRigidBody: (id: string) => any;
}

export interface AssetRuntimeContextValue extends AssetRuntime { }

export interface EntityRuntime {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    getObject: <T extends Object3D = Object3D>() => T | null;
    getRigidBody: <T = any>() => T | null;
}

export interface LiveRef<T> { readonly current: T | null; }
export type LiveObjectRef<T extends Object3D = Object3D> = LiveRef<T>;
export type LiveRigidBodyRef<T = any> = LiveRef<T>;

export const AssetRuntimeContext = createContext<AssetRuntimeContextValue | null>(null);
const EntityRuntimeContext = createContext<EntityRuntime | null>(null);

export function useAssetRuntime(): AssetRuntime {
    const ctx = useContext(AssetRuntimeContext);
    if (!ctx) throw new Error("useAssetRuntime must be used inside <PrefabRoot>");
    return ctx;
}

export function useEntityRuntime(): EntityRuntime {
    const ctx = useContext(EntityRuntimeContext);
    if (!ctx) throw new Error("useEntityRuntime must be used inside a component View rendered by <PrefabRoot>");
    return ctx;
}

export function useEntityObjectRef<T extends Object3D = Object3D>(): LiveRef<T> {
    const { getObject } = useEntityRuntime();
    return useMemo(() => ({ get current() { return getObject<T>(); } }), [getObject]);
}

export function useEntityRigidBodyRef<T = any>(): LiveRef<T> {
    const { getRigidBody } = useEntityRuntime();
    return useMemo(() => ({ get current() { return getRigidBody<T>(); } }), [getRigidBody]);
}

export function EntityRuntimeScope({
    nodeId,
    editMode,
    isSelected,
    children,
}: {
    nodeId: string;
    editMode?: boolean;
    isSelected?: boolean;
    children: ReactNode;
}) {
    const asset = useContext(AssetRuntimeContext);
    if (!asset) throw new Error("EntityRuntimeScope must be used inside <PrefabRoot>");

    const value = useMemo<EntityRuntime>(() => ({
        nodeId,
        editMode,
        isSelected,
        getObject: <T extends Object3D = Object3D>() => asset.getObject(nodeId) as T | null,
        getRigidBody: <T = any>() => asset.getRigidBody(nodeId) as T | null,
    }), [asset, editMode, isSelected, nodeId]);

    return <EntityRuntimeContext.Provider value={value}>{children}</EntityRuntimeContext.Provider>;
}

// ------- Runtime lifecycle engine -------

/** Runtime behaviour produced by `Component.create(ctx)`. All methods optional. */
export interface ComponentInstance {
    start?(): void;
    update?(dt: number): void;
    destroy?(): void;
}

export interface ComponentRuntimeContext<TProperties = Record<string, any>> {
    scene: Scene;
    component: EntityComponent<TProperties>;
    object: Object3D;
    rigidBody: any;
}

export interface RuntimeEngine {
    tick: (dt: number) => void;
    setActive: (active: boolean) => void;
    invalidate: () => void;
    dispose: () => void;
}

type RuntimeInstanceRecord = {
    instance: ComponentInstance;
    object: Object3D;
    rigidBody: any;
};

export function createRuntimeEngine({
    store,
    getObject,
    getRigidBody,
}: {
    store: PrefabStoreApi;
    getObject: (id: string) => Object3D | null;
    getRigidBody: (id: string) => any;
}): RuntimeEngine {
    const scene = createScene({
        getRootId: () => store.getState().rootId,
        getNode: (id) => store.getState().nodesById[id] ?? null,
        getChildIds: (id) => store.getState().childIdsById[id] ?? [],
        getParentId: (id) => store.getState().parentIdById[id] ?? null,
        updateNode: (id, update) => store.getState().updateNode(id, update),
        updateNodes: (updates) => {
            store.getState().updateNodes(
                Object.entries(updates).map(([id, update]) => ({ id, update })),
            );
        },
        addNode: (node, options) => {
            const parentId = options?.parentId ?? store.getState().rootId;
            store.getState().addChild(parentId, node);
            return node.id;
        },
        removeNode: (id) => store.getState().deleteNode(id),
        getObject,
        getRigidBody,
    });

    // key = `${nodeId}:${componentKey}:${componentType}`
    const instances = new Map<string, RuntimeInstanceRecord>();
    let active = false;
    let dirty = true;
    let lastRevision = store.getState().revision;

    const unsubscribe = store.subscribe((state) => {
        if (state.revision === lastRevision) return;
        lastRevision = state.revision;
        dirty = true;
    });

    function destroy(key: string) {
        const record = instances.get(key);
        if (!record) return;
        try { record.instance.destroy?.(); } catch (error) { console.error(`[runtime] destroy ${key}`, error); }
        instances.delete(key);
    }

    function sync() {
        const state = store.getState();
        const live = new Set<string>();
        let hasPendingMount = false;

        const visit = (nodeId: string) => {
            const node = state.nodesById[nodeId];
            if (!node) return;

            if (!node.disabled && node.components) {
                for (const componentKey in node.components) {
                    const data = node.components[componentKey];
                    if (!data?.type) continue;
                    const def = getComponentDef(data.type);
                    if (!def?.create) continue;

                    const key = `${nodeId}:${componentKey}:${data.type}`;
                    live.add(key);
                    const object = getObject(nodeId);
                    if (!object) { hasPendingMount = true; continue; }
                    const rigidBody = getRigidBody(nodeId);
                    const existing = instances.get(key);

                    if (existing && existing.object === object && existing.rigidBody === rigidBody) {
                        continue;
                    }

                    if (existing) {
                        destroy(key);
                    }

                    const entity = scene.find(nodeId);
                    const component = entity?.getComponent(componentKey);
                    if (!entity || !component) continue;

                    let instance: ComponentInstance;
                    try {
                        instance = def.create({ scene, component, object, rigidBody }) ?? {};
                    } catch (error) { console.error(`[runtime] create ${key}`, error); continue; }
                    instances.set(key, { instance, object, rigidBody });
                    try { instance.start?.(); } catch (error) { console.error(`[runtime] start ${key}`, error); }
                }
            }

            for (const childId of state.childIdsById[nodeId] ?? []) visit(childId);
        };

        visit(state.rootId);

        for (const key of Array.from(instances.keys())) {
            if (!live.has(key)) destroy(key);
        }
        dirty = hasPendingMount;
    }

    return {
        tick(dt) {
            if (!active) return;
            if (dirty) sync();
            for (const [key, record] of instances) {
                if (!record.instance.update) continue;
                try { record.instance.update(dt); } catch (error) { console.error(`[runtime] update ${key}`, error); }
            }
        },
        setActive(nextActive) {
            if (active === nextActive) return;
            active = nextActive;
            dirty = true;
            if (!active) {
                for (const key of Array.from(instances.keys())) destroy(key);
            }
        },
        invalidate() {
            dirty = true;
        },
        dispose() {
            active = false;
            for (const key of Array.from(instances.keys())) destroy(key);
            unsubscribe();
        },
    };
}
