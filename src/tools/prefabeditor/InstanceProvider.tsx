import React, { createContext, useContext, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Merged, useHelper } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import { Mesh, Matrix4, Object3D, Group, BoxHelper } from "three";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { usePointerEvents } from "./usePointerEvents";

export type RepeatAxisConfig = {
    axis: 'x' | 'y' | 'z';
    count: number;
    offset: number;
};

export const DEFAULT_REPEAT_AXES: RepeatAxisConfig[] = [{ axis: 'x', count: 1, offset: 1 }];

export function normalizeRepeatAxes(value: unknown): RepeatAxisConfig[] {
    if (!Array.isArray(value)) {
        return DEFAULT_REPEAT_AXES;
    }

    const seen = new Set<string>();
    const normalized = value.reduce<RepeatAxisConfig[]>((result, entry) => {
        if (!entry || typeof entry !== 'object') return result;

        const axisValue = (entry as any).axis;
        if (axisValue !== 'x' && axisValue !== 'y' && axisValue !== 'z') return result;
        if (seen.has(axisValue)) return result;
        seen.add(axisValue);

        const countValue = Number((entry as any).count);
        const offsetValue = Number((entry as any).offset);

        result.push({
            axis: axisValue,
            count: Number.isFinite(countValue) ? Math.max(1, Math.floor(countValue)) : 1,
            offset: Number.isFinite(offsetValue) ? offsetValue : 1,
        });
        return result;
    }, []);

    return normalized.length > 0 ? normalized : DEFAULT_REPEAT_AXES;
}

function toVector3Tuple(value: unknown, fallback: [number, number, number]): [number, number, number] {
    if (!Array.isArray(value) || value.length !== 3) return fallback;

    return value.map((entry, index) => {
        const next = typeof entry === 'number' ? entry : Number(entry);
        return Number.isFinite(next) ? next : fallback[index];
    }) as [number, number, number];
}

export function getRepeatAxesFromModelProperties(properties: Record<string, any>): RepeatAxisConfig[] {
    if (Array.isArray(properties.repeatAxes)) {
        return normalizeRepeatAxes(properties.repeatAxes);
    }

    const repeatCount = toVector3Tuple(properties.repeatCount, [1, 1, 1]).map(value => Math.max(1, Math.floor(value))) as [number, number, number];
    const repeatOffset = toVector3Tuple(properties.repeatOffset, [1, 1, 1]);
    const legacyAxes: RepeatAxisConfig[] = [];

    if (properties.repeatX ?? true) {
        legacyAxes.push({ axis: 'x', count: repeatCount[0], offset: repeatOffset[0] });
    }

    if (properties.repeatY) {
        legacyAxes.push({ axis: 'y', count: repeatCount[1], offset: repeatOffset[1] });
    }

    if (properties.repeatZ) {
        legacyAxes.push({ axis: 'z', count: repeatCount[2], offset: repeatOffset[2] });
    }

    return legacyAxes.length > 0 ? legacyAxes : DEFAULT_REPEAT_AXES;
}

// --- Types ---
export type InstanceData = {
    id: string;
    sourceId: string;
    locked?: boolean;
    visible?: boolean;
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
        a.meshPath === b.meshPath &&
        arrayEquals(a.position, b.position) &&
        arrayEquals(a.rotation, b.rotation) &&
        arrayEquals(a.scale, b.scale);
}

type InstanceRegistryState = {
    instancesById: Record<string, InstanceData>;
    sourceInstanceIdsById: Record<string, Record<string, true> | undefined>;
    addInstance: (instance: InstanceData) => void;
    removeInstance: (id: string) => void;
};

function createInstanceRegistryStore() {
    return createStore<InstanceRegistryState>()((set, get) => ({
        instancesById: {},
        sourceInstanceIdsById: {},
        addInstance: (instance) => {
            const previous = get().instancesById[instance.id];
            if (previous && instanceEquals(previous, instance)) {
                return;
            }

            set(state => {
                const instancesById = { ...state.instancesById, [instance.id]: instance };
                const sourceInstanceIdsById = { ...state.sourceInstanceIdsById };

                if (previous && previous.sourceId !== previous.id) {
                    const previousSourceInstances = { ...(sourceInstanceIdsById[previous.sourceId] ?? {}) };
                    delete previousSourceInstances[previous.id];
                    sourceInstanceIdsById[previous.sourceId] = Object.keys(previousSourceInstances).length > 0
                        ? previousSourceInstances
                        : undefined;
                }

                if (instance.sourceId !== instance.id) {
                    sourceInstanceIdsById[instance.sourceId] = {
                        ...(sourceInstanceIdsById[instance.sourceId] ?? {}),
                        [instance.id]: true,
                    };
                }

                return { instancesById, sourceInstanceIdsById };
            });
        },
        removeInstance: (id) => {
            const previous = get().instancesById[id];
            if (!previous) return;

            set(state => {
                const instancesById = { ...state.instancesById };
                const sourceInstanceIdsById = { ...state.sourceInstanceIdsById };
                delete instancesById[id];

                if (previous.sourceId !== previous.id) {
                    const sourceInstances = { ...(sourceInstanceIdsById[previous.sourceId] ?? {}) };
                    delete sourceInstances[id];
                    sourceInstanceIdsById[previous.sourceId] = Object.keys(sourceInstances).length > 0
                        ? sourceInstances
                        : undefined;
                }

                return { instancesById, sourceInstanceIdsById };
            });
        },
    }));
}

type GameInstanceContextType = {
    store: StoreApi<InstanceRegistryState>;
    meshes: Record<string, Mesh>;
    modelParts?: Record<string, number>;
};
const GameInstanceContext = createContext<GameInstanceContextType | null>(null);

export function GameInstanceProvider({
    children,
    models,
    onSelect,
    onClick,
    registerRef,
    selectedId,
    editMode
}: {
    children: React.ReactNode,
    models: { [filename: string]: Object3D },
    onSelect?: (id: string | null) => void,
    onClick?: (event: ThreeEvent<PointerEvent>, nodeId: string, object: Object3D | null) => void,
    registerRef?: (id: string, obj: Object3D | null) => void,
    selectedId?: string | null,
    editMode?: boolean
}) {
    const [instanceStore] = useState(createInstanceRegistryStore);
    const instancesById = useStore(instanceStore, state => state.instancesById);

    // Flatten all model meshes once (models → flat mesh parts)
    // Note: Geometry is cloned with baked transforms for instancing
    const { flatMeshes, modelParts } = useMemo(() => {
        const flatMeshes: Record<string, Mesh> = {};
        const modelParts: Record<string, number> = {};

        Object.entries(models).forEach(([modelKey, model]) => {
            model.updateWorldMatrix(false, true);
            const rootInverse = new Matrix4().copy(model.matrixWorld).invert();

            let partIndex = 0;
            model.traverse((obj: any) => {
                if (obj.isMesh) {
                    // Clone geometry and bake relative transform
                    const geom = obj.geometry.clone();
                    geom.applyMatrix4(obj.matrixWorld.clone().premultiply(rootInverse));

                    const partKey = `${modelKey}__${partIndex}`;
                    flatMeshes[partKey] = new Mesh(geom, obj.material);
                    partIndex++;
                }
            });
            modelParts[modelKey] = partIndex;
        });

        return { flatMeshes, modelParts };
    }, [models]);

    // Cleanup geometries when models change
    useEffect(() => {
        return () => {
            Object.values(flatMeshes).forEach(mesh => mesh.geometry.dispose());
        };
    }, [flatMeshes]);

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

    const contextValue = useMemo(() => ({
        store: instanceStore,
        meshes: flatMeshes,
        modelParts,
    }), [instanceStore, flatMeshes, modelParts]);

    return (
        <GameInstanceContext.Provider
            value={contextValue}
        >
            {children}

            {Object.entries(grouped).map(([key, group]) => {
                const modelKey = group.instances[0].meshPath;
                const partCount = modelParts[modelKey] || 0;
                if (partCount === 0) return null;

                const meshesForModel: Record<string, Mesh> = {};
                for (let i = 0; i < partCount; i++) {
                    const partKey = `${modelKey}__${i}`;
                    meshesForModel[partKey] = flatMeshes[partKey];
                }

                return (
                    <Merged
                        key={key}
                        meshes={meshesForModel}
                        castShadow
                        receiveShadow
                    >
                        {(instancesMap: any) => (
                            <InstancedGroup
                                modelKey={modelKey}
                                group={group}
                                partCount={partCount}
                                instancesMap={instancesMap}
                                onSelect={onSelect}
                                onClick={onClick}
                                registerRef={registerRef}
                                selectedId={selectedId}
                                editMode={editMode}
                            />
                        )}
                    </Merged>
                );
            })}
        </GameInstanceContext.Provider>
    );
}
function InstancedGroup({
    modelKey,
    group,
    partCount,
    instancesMap,
    onSelect,
    onClick,
    registerRef,
    selectedId,
    editMode
}: {
    modelKey: string;
    group: { instances: InstanceData[] };
    partCount: number;
    instancesMap: Record<string, React.ComponentType<any>>;
    onSelect?: (id: string | null) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, nodeId: string, object: Object3D | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    selectedId?: string | null;
    editMode?: boolean;
}) {
    const InstanceComponents = useMemo(() =>
        Array.from({ length: partCount }, (_, i) => instancesMap[`${modelKey}__${i}`]).filter(Boolean),
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
                    InstanceComponents={InstanceComponents}
                    onSelect={onSelect}
                    onClick={onClick}
                    registerRef={registerRef}
                    selectedId={selectedId}
                    editMode={editMode}
                />
            ))}
        </>
    );
}

// Individual instance item with its own click state
function InstanceGroupItem({
    instance,
    InstanceComponents,
    onSelect,
    onClick,
    registerRef,
    selectedId,
    editMode
}: {
    instance: InstanceData;
    InstanceComponents: React.ComponentType<any>[];
    onSelect?: (id: string | null) => void;
    onClick?: (event: ThreeEvent<PointerEvent>, nodeId: string, object: Object3D | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    selectedId?: string | null;
    editMode?: boolean;
}) {
    const groupRef = useRef<Group>(null!);
    const isLocked = Boolean(instance.locked);
    const isSelected = selectedId === instance.id || selectedId === instance.sourceId;
    const canSelect = editMode && !isLocked;
    const canClick = !editMode && Boolean(onClick);

    const pointerHandlers = usePointerEvents({
        enabled: canSelect || canClick,
        node: instance,
        onClick: (event) => {
            if (editMode) {
                onSelect?.(instance.sourceId);
                return;
            }

            onClick?.(event, instance.sourceId, groupRef.current);
        },
    });

    // Use BoxHelper when object is selected in edit mode
    useHelper(editMode && isSelected ? groupRef : null, BoxHelper, 'cyan');

    useEffect(() => {
        if (editMode) return;
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
            {InstanceComponents.map((Instance, i) => <Instance key={i} />)}
        </group>
    );
}


export function useInstanceCheck(id: string): boolean {
    const ctx = useContext(GameInstanceContext);
    return ctx ? useStore(ctx.store, state => Boolean(state.instancesById[id] || state.sourceInstanceIdsById[id])) : false;
}

export const GameInstance = React.forwardRef<Group, {
    id: string;
    sourceId?: string;
    modelUrl: string;
    locked?: boolean;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    visible?: boolean;
    onClick?: (event: ThreeEvent<PointerEvent>, nodeId: string, object: Object3D | null) => void;
}>(({
    id,
    sourceId,
    modelUrl,
    locked = false,
    position,
    rotation,
    scale,
    visible = true,
    onClick: _onClick,
}, ref) => {
    const ctx = useContext(GameInstanceContext);
    const [positionX, positionY, positionZ] = position;
    const [rotationX, rotationY, rotationZ] = rotation;
    const [scaleX, scaleY, scaleZ] = scale;

    const instance = useMemo<InstanceData>(() => ({
        id,
        sourceId: sourceId ?? id,
        locked,
        visible,
        meshPath: modelUrl,
        position,
        rotation,
        scale,
    }), [
        id,
        sourceId,
        locked,
        visible,
        modelUrl,
        positionX,
        positionY,
        positionZ,
        rotationX,
        rotationY,
        rotationZ,
        scaleX,
        scaleY,
        scaleZ,
    ]);

    useEffect(() => {
        if (!ctx) return;
        const store = ctx.store;
        const { addInstance, removeInstance } = store.getState();
        addInstance(instance);
        return () => {
            removeInstance(instance.id);
        };
    }, [ctx?.store, instance]);

    return null;
});