import { createContext, useContext, useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import { Merged, useHelper } from '@react-three/drei';
import { Mesh, Matrix4, BoxHelper } from "three";
import type { Group, Object3D } from "three";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createNodeInteractionHandlers, usePointerEvents } from "./usePointerEvents";
import type { NodeInteractionEvent, NodeInteractionEventType } from "./usePointerEvents";
import { useNodeSelected } from "./SelectionRuntime";
import { useModelAsset } from "./assetRuntime";

export type RepeatAxisConfig = {
    axis: 'x' | 'y' | 'z';
    count: number;
    offset: number;
};

export const DEFAULT_REPEAT_AXES: RepeatAxisConfig[] = [{ axis: 'x', count: 1, offset: 1 }];
const EMPTY_INSTANCE_STORE = createInstanceRegistryStore();

export function normalizeRepeatAxes(value: unknown): RepeatAxisConfig[] {
    if (!Array.isArray(value)) {
        return DEFAULT_REPEAT_AXES;
    }

    const seen = new Set<string>();
    const normalized = value.reduce<RepeatAxisConfig[]>((result, entry) => {
        if (!entry || typeof entry !== 'object') return result;
        const record = entry as Partial<Record<'axis' | 'count' | 'offset', unknown>>;

        const axisValue = record.axis;
        if (axisValue !== 'x' && axisValue !== 'y' && axisValue !== 'z') return result;
        if (seen.has(axisValue)) return result;
        seen.add(axisValue);

        const countValue = Number(record.count);
        const offsetValue = Number(record.offset);

        result.push({
            axis: axisValue,
            count: Number.isFinite(countValue) ? Math.max(1, Math.floor(countValue)) : 1,
            offset: Number.isFinite(offsetValue) ? offsetValue : 1,
        });
        return result;
    }, []);

    return normalized.length > 0 ? normalized : DEFAULT_REPEAT_AXES;
}

export function getRepeatAxesFromModelProperties(properties: Record<string, unknown>): RepeatAxisConfig[] {
    if (Array.isArray(properties.repeatAxes)) {
        return normalizeRepeatAxes(properties.repeatAxes);
    }

    return DEFAULT_REPEAT_AXES;
}

// --- Types ---
export type InstanceData = {
    id: string;
    sourceId: string;
    locked?: boolean;
    visible?: boolean;
    clickEnabled?: boolean;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    meshPath: string;
};

// Helper functions for comparison
function arrayEquals(a: number[], b: number[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function instanceEquals(a: InstanceData, b: InstanceData): boolean {
    return a.id === b.id &&
        a.sourceId === b.sourceId &&
        a.locked === b.locked &&
        a.visible === b.visible &&
        a.clickEnabled === b.clickEnabled &&
        a.meshPath === b.meshPath &&
        arrayEquals(a.position, b.position) &&
        arrayEquals(a.rotation, b.rotation) &&
        arrayEquals(a.scale, b.scale);
}

type InstanceRegistryState = {
    instancesById: Record<string, InstanceData>;
    sourceInstanceIdsById: Record<string, Record<string, true> | undefined>;
    setSourceInstances: (sourceId: string, instances: InstanceData[]) => void;
};

function createInstanceRegistryStore() {
    return createStore<InstanceRegistryState>()((set, get) => ({
        instancesById: {},
        sourceInstanceIdsById: {},
        setSourceInstances: (sourceId, instances) => {
            const state = get();
            const previousIds = Object.keys(state.sourceInstanceIdsById[sourceId] ?? {});
            const nextById: Record<string, InstanceData> = {};
            instances.forEach(instance => { nextById[instance.id] = instance; });
            const unchanged = previousIds.length === instances.length
                && instances.every(instance => {
                    const previous = state.instancesById[instance.id];
                    return previous ? instanceEquals(previous, instance) : false;
                });
            if (unchanged) return;

            set(current => {
                const instancesById = { ...current.instancesById };
                previousIds.forEach(id => { delete instancesById[id]; });
                Object.assign(instancesById, nextById);
                const sourceInstanceIdsById = { ...current.sourceInstanceIdsById };
                if (instances.length > 0) {
                    const ids: Record<string, true> = {};
                    instances.forEach(instance => { ids[instance.id] = true; });
                    sourceInstanceIdsById[sourceId] = ids;
                } else {
                    delete sourceInstanceIdsById[sourceId];
                }
                return { instancesById, sourceInstanceIdsById };
            });
        },
    }));
}

type GameInstanceContextType = {
    store: StoreApi<InstanceRegistryState>;
};
const GameInstanceContext = createContext<GameInstanceContextType | null>(null);

export function GameInstanceProvider({
    children,
    onSelect,
    onPointerEvent,
    registerRef,
    getObject,
    editMode
}: {
    children: ReactNode,
    onSelect?: (id: string | null) => void,
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
    ) => void,
    registerRef?: (id: string, obj: Object3D | null) => void,
    getObject: (id: string) => Object3D | null,
    editMode?: boolean
}) {
    const [instanceStore] = useState(createInstanceRegistryStore);
    const instancesById = useStore(instanceStore, state => state.instancesById);

    const instances = useMemo(() => Object.values(instancesById), [instancesById]);

    // Group instances by meshPath for batched rendering.
    const grouped = useMemo(() => {
        const groups: Record<string, { instances: InstanceData[] }> = {};
        for (const inst of instances) {
            const key = inst.meshPath;
            if (!groups[key]) groups[key] = { instances: [] };
            groups[key].instances.push(inst);
        }

        Object.values(groups).forEach(group => {
            group.instances.sort((a, b) => a.id.localeCompare(b.id));
        });

        return groups;
    }, [instances]);

    const contextValue = useMemo(() => ({ store: instanceStore }), [instanceStore]);

    return (
        <GameInstanceContext.Provider
            value={contextValue}
        >
            {children}

            {Object.entries(grouped).map(([key, group]) => {
                return (
                    <InstancedModelBatch
                        key={key}
                        modelKey={group.instances[0].meshPath}
                        group={group}
                        onSelect={onSelect}
                        onPointerEvent={onPointerEvent}
                        registerRef={registerRef}
                        getObject={getObject}
                        editMode={editMode}
                    />
                );
            })}
        </GameInstanceContext.Provider>
    );
}

function InstancedModelBatch({
    modelKey,
    group,
    onSelect,
    onPointerEvent,
    registerRef,
    getObject,
    editMode,
}: {
    modelKey: string;
    group: { instances: InstanceData[] };
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
    ) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    getObject: (id: string) => Object3D | null;
    editMode?: boolean;
}) {
    const model = useModelAsset(modelKey);
    const meshes = useMemo(() => {
        if (!model) return {};
        const result: Record<string, Mesh> = {};
        model.updateWorldMatrix(false, true);
        const rootInverse = new Matrix4().copy(model.matrixWorld).invert();
        let partIndex = 0;
        model.traverse(obj => {
            if (!(obj instanceof Mesh)) return;
            const geometry = obj.geometry.clone();
            geometry.applyMatrix4(obj.matrixWorld.clone().premultiply(rootInverse));
            result[`${modelKey}__${partIndex}`] = new Mesh(geometry, obj.material);
            partIndex += 1;
        });
        return result;
    }, [model, modelKey]);

    useEffect(() => () => {
        Object.values(meshes).forEach(mesh => mesh.geometry.dispose());
    }, [meshes]);

    const partCount = Object.keys(meshes).length;
    if (partCount === 0) return null;

    return (
        <Merged meshes={meshes} castShadow receiveShadow>
            {(instancesMap: Record<string, ComponentType<object>>) => (
                <InstancedGroup
                    modelKey={modelKey}
                    group={group}
                    partCount={partCount}
                    instancesMap={instancesMap}
                    onSelect={onSelect}
                    onPointerEvent={onPointerEvent}
                    registerRef={registerRef}
                    getObject={getObject}
                    editMode={editMode}
                />
            )}
        </Merged>
    );
}

function InstancedGroup({
    modelKey,
    group,
    partCount,
    instancesMap,
    onSelect,
    onPointerEvent,
    registerRef,
    getObject,
    editMode
}: {
    modelKey: string;
    group: { instances: InstanceData[] };
    partCount: number;
    instancesMap: Record<string, ComponentType<object>>;
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
    ) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    getObject: (id: string) => Object3D | null;
    editMode?: boolean;
}) {
    const instanceEntries = useMemo(() =>
        Array.from({ length: partCount }, (_, i) => {
            const partKey = `${modelKey}__${i}`;
            const Component = instancesMap[partKey];
            return Component ? { partKey, Component } : null;
        }).filter((entry): entry is { partKey: string; Component: ComponentType<object> } => Boolean(entry)),
        [instancesMap, modelKey, partCount]
    );
    const visibleInstances = useMemo(
        () => group.instances.filter(instance => instance.visible !== false),
        [group.instances]
    );

    return (
        <>
            {visibleInstances.map(inst => (
                <InstanceGroupItem
                    key={inst.id}
                    instance={inst}
                    instanceEntries={instanceEntries}
                    onSelect={onSelect}
                    onPointerEvent={onPointerEvent}
                    registerRef={registerRef}
                    getObject={getObject}
                    editMode={editMode}
                />
            ))}
        </>
    );
}

// Individual instance item with its own click state
function InstanceGroupItem({
    instance,
    instanceEntries,
    onSelect,
    onPointerEvent,
    registerRef,
    getObject,
    editMode
}: {
    instance: InstanceData;
    instanceEntries: Array<{ partKey: string; Component: ComponentType<object> }>;
    onSelect?: (id: string | null) => void;
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
    ) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    getObject: (id: string) => Object3D | null;
    editMode?: boolean;
}) {
    const groupRef = useRef<Group | null>(null);
    const helperRef = useRef<Object3D>(null!);
    const isLocked = Boolean(instance.locked);
    const instanceSelected = useNodeSelected(instance.id);
    const sourceSelected = useNodeSelected(instance.sourceId);
    const isSelected = instanceSelected || sourceSelected;
    const canSelect = Boolean(editMode) && !isLocked;
    const canClick = !editMode && Boolean(instance.clickEnabled) && Boolean(onPointerEvent);

    const editPointerHandlers = usePointerEvents({
        enabled: canSelect,
        node: instance,
        onClick: (event) => {
            onSelect?.(instance.sourceId);
        },
    });
    const runtimePointerHandlers = canClick && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, instance.sourceId, groupRef.current);
        })
        : {};
    const pointerHandlers = editMode ? editPointerHandlers : runtimePointerHandlers;

    // Use BoxHelper when object is selected in edit mode
    if (groupRef.current) helperRef.current = groupRef.current;
    useHelper(editMode && isSelected && groupRef.current ? helperRef : null, BoxHelper, 'cyan');

    useLayoutEffect(() => {
        const sourceObject = getObject(instance.sourceId);
        const instanceObject = groupRef.current;
        if (!sourceObject || !instanceObject) return;
        sourceObject.add(instanceObject);
        return () => {
            sourceObject.remove(instanceObject);
        };
    }, [getObject, instance.sourceId]);

    useEffect(() => {
        if (editMode) return;
        if (instance.id === instance.sourceId) return;
        registerRef?.(instance.id, groupRef.current);
        return () => registerRef?.(instance.id, null);
    }, [editMode, instance.id, registerRef]);

    return (
        <group
            ref={groupRef}
            position={instance.position}
            rotation={instance.rotation}
            scale={instance.scale}
            {...pointerHandlers}
        >
            {instanceEntries.map(({ partKey, Component }) => <Component key={partKey} />)}
        </group>
    );
}


export function useInstanceCheck(id: string): boolean {
    const ctx = useContext(GameInstanceContext);
    const store = ctx?.store ?? EMPTY_INSTANCE_STORE;
    return useStore(store, state => Boolean(state.instancesById[id] || state.sourceInstanceIdsById[id]));
}

export function GameInstanceBatch({
    sourceId,
    instances,
}: {
    sourceId: string;
    instances: Array<Omit<InstanceData, 'sourceId' | 'meshPath'> & { modelUrl: string }>;
}) {
    const ctx = useContext(GameInstanceContext);
    const store = ctx?.store;
    const instanceData = useMemo<InstanceData[]>(() => instances.map(instance => ({
        id: instance.id,
        sourceId,
        locked: instance.locked,
        visible: instance.visible,
        clickEnabled: instance.clickEnabled,
        meshPath: instance.modelUrl,
        position: instance.position,
        rotation: instance.rotation,
        scale: instance.scale,
    })), [instances, sourceId]);

    useEffect(() => {
        store?.getState().setSourceInstances(sourceId, instanceData);
    }, [instanceData, sourceId, store]);

    useEffect(() => () => {
        store?.getState().setSourceInstances(sourceId, []);
    }, [sourceId, store]);

    return null;
}
