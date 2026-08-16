import { createContext, useContext, useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Merged } from '@react-three/drei';
import { Mesh, Matrix4 } from "three";
import type { Group, Object3D } from "three";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createNodeInteractionHandlers } from "./usePointerEvents";
import type { NodeInteractionEvent, NodeInteractionEventType } from "./usePointerEvents";
import { useModelAsset } from "./assetRuntime";
import { scheduleObjectRaycast } from "../../shared/raycast";

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
    visible?: boolean;
    clickEnabled?: boolean;
    clickEventName?: string | null;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    modelPath: string;
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
        a.visible === b.visible &&
        a.clickEnabled === b.clickEnabled &&
        a.clickEventName === b.clickEventName &&
        a.modelPath === b.modelPath &&
        arrayEquals(a.position, b.position) &&
        arrayEquals(a.rotation, b.rotation) &&
        arrayEquals(a.scale, b.scale);
}

type InstanceRegistryState = {
    instancesById: Record<string, InstanceData>;
    instanceIdsBySourceId: Record<string, string[] | undefined>;
    setSourceInstances: (sourceId: string, instances: InstanceData[]) => void;
};

function createInstanceRegistryStore() {
    return createStore<InstanceRegistryState>()((set, get) => ({
        instancesById: {},
        instanceIdsBySourceId: {},
        setSourceInstances: (sourceId, instances) => {
            const state = get();
            const previousIds = state.instanceIdsBySourceId[sourceId] ?? [];
            const unchanged = previousIds.length === instances.length
                && instances.every(instance => {
                    const previous = state.instancesById[instance.id];
                    return previous ? instanceEquals(previous, instance) : false;
                });
            if (unchanged) return;

            set(current => {
                const instancesById = { ...current.instancesById };
                previousIds.forEach(id => { delete instancesById[id]; });
                instances.forEach(instance => { instancesById[instance.id] = instance; });
                const instanceIdsBySourceId = { ...current.instanceIdsBySourceId };
                if (instances.length > 0) {
                    instanceIdsBySourceId[sourceId] = instances.map(instance => instance.id);
                } else {
                    delete instanceIdsBySourceId[sourceId];
                }
                return { instancesById, instanceIdsBySourceId };
            });
        },
    }));
}

type InstanceRuntimeProps = {
    onPointerEvent?: (
        eventType: NodeInteractionEventType,
        event: NodeInteractionEvent,
        nodeId: string,
        object: Object3D | null,
        eventName: string | null,
    ) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    getObject: (id: string) => Object3D | null;
    editMode?: boolean;
};
const GameInstanceContext = createContext<StoreApi<InstanceRegistryState> | null>(null);

export function GameInstanceProvider({
    children,
    onEditClick,
    onPointerEvent,
    registerRef,
    getObject,
    editMode
}: InstanceRuntimeProps & {
    children: ReactNode;
    onEditClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
    const [instanceStore] = useState(createInstanceRegistryStore);
    const instancesById = useStore(instanceStore, state => state.instancesById);

    const instancesByModelPath = useMemo(() => {
        const groups: Record<string, InstanceData[]> = {};
        for (const instance of Object.values(instancesById)) {
            (groups[instance.modelPath] ??= []).push(instance);
        }

        Object.values(groups).forEach(instances => instances.sort((a, b) => a.id.localeCompare(b.id)));

        return groups;
    }, [instancesById]);

    return (
        <GameInstanceContext.Provider value={instanceStore}>
            <group onClick={onEditClick}>
                {children}

                {Object.entries(instancesByModelPath).map(([modelPath, instances]) => (
                    <InstancedModelBatch
                        key={modelPath}
                        modelPath={modelPath}
                        instances={instances}
                        onPointerEvent={onPointerEvent}
                        registerRef={registerRef}
                        getObject={getObject}
                        editMode={editMode}
                    />
                ))}
            </group>
        </GameInstanceContext.Provider>
    );
}

function InstancedModelBatch({
    modelPath,
    instances,
    onPointerEvent,
    registerRef,
    getObject,
    editMode,
}: InstanceRuntimeProps & {
    modelPath: string;
    instances: InstanceData[];
}) {
    const model = useModelAsset(modelPath);
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
            result[`part${partIndex}`] = new Mesh(geometry, obj.material);
            partIndex += 1;
        });
        return result;
    }, [model]);

    useEffect(() => () => {
        Object.values(meshes).forEach(mesh => mesh.geometry.dispose());
    }, [meshes]);

    const raycastEnabled = editMode || instances.some(instance => instance.clickEnabled);
    useEffect(() => {
        if (!raycastEnabled) return;
        for (const mesh of Object.values(meshes)) {
            scheduleObjectRaycast(mesh);
        }
    }, [meshes, raycastEnabled]);

    if (Object.keys(meshes).length === 0) return null;

    return (
        <Merged meshes={meshes} castShadow receiveShadow>
            {(instancesMap: Record<string, ComponentType<object>>) => (
                <InstancedGroup
                    instances={instances}
                    instancesMap={instancesMap}
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
    instances,
    instancesMap,
    onPointerEvent,
    registerRef,
    getObject,
    editMode
}: InstanceRuntimeProps & {
    instances: InstanceData[];
    instancesMap: Record<string, ComponentType<object>>;
}) {
    const instanceEntries = useMemo(
        () => Object.entries(instancesMap).map(([partKey, Component]) => ({ partKey, Component })),
        [instancesMap],
    );
    const visibleInstances = useMemo(
        () => instances.filter(instance => instance.visible !== false),
        [instances]
    );

    return (
        <>
            {visibleInstances.map(inst => (
                <InstanceGroupItem
                    key={inst.id}
                    instance={inst}
                    instanceEntries={instanceEntries}
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
    onPointerEvent,
    registerRef,
    getObject,
    editMode
}: InstanceRuntimeProps & {
    instance: InstanceData;
    instanceEntries: Array<{ partKey: string; Component: ComponentType<object> }>;
}) {
    const groupRef = useRef<Group>(null!);
    const pointerHandlers = !editMode && instance.clickEnabled && onPointerEvent
        ? createNodeInteractionHandlers((eventType, event) => {
            event.stopPropagation();
            onPointerEvent(eventType, event, instance.sourceId, groupRef.current, instance.clickEventName ?? null);
        })
        : undefined;

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
    const store = useContext(GameInstanceContext) ?? EMPTY_INSTANCE_STORE;
    return useStore(store, state => Boolean(state.instancesById[id] || state.instanceIdsBySourceId[id]));
}

export function GameInstanceBatch({
    sourceId,
    instances,
}: {
    sourceId: string;
    instances: Array<Omit<InstanceData, 'sourceId'>>;
}) {
    const store = useContext(GameInstanceContext);
    const instanceData = useMemo<InstanceData[]>(
        () => instances.map(instance => ({ ...instance, sourceId })),
        [instances, sourceId],
    );

    useEffect(() => {
        store?.getState().setSourceInstances(sourceId, instanceData);
    }, [instanceData, sourceId, store]);

    useEffect(() => () => {
        store?.getState().setSourceInstances(sourceId, []);
    }, [sourceId, store]);

    return null;
}
