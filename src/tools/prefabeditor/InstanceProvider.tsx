import React, { createContext, useContext, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Merged, useHelper } from '@react-three/drei';
import { InstancedRigidBodies } from "@react-three/rapier";
import type { CollisionPayload, InstancedRigidBodyProps, IntersectionEnterPayload, IntersectionExitPayload } from "@react-three/rapier";
import { ActiveCollisionTypes } from "@dimforge/rapier3d-compat";
import { Mesh, Matrix4, Object3D, Group, Vector3, Quaternion, Euler, InstancedMesh, BoxHelper } from "three";
import { PhysicsProps } from "./components/PhysicsComponent";
import { gameEvents, getEntityIdFromRigidBody } from "./GameEvents";

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
    const normalized = value.flatMap((entry): RepeatAxisConfig[] => {
        if (!entry || typeof entry !== 'object') return [];

        const axisValue = (entry as any).axis;
        if (axisValue !== 'x' && axisValue !== 'y' && axisValue !== 'z') return [];
        if (seen.has(axisValue)) return [];
        seen.add(axisValue);

        const countValue = Number((entry as any).count);
        const offsetValue = Number((entry as any).offset);

        return [{
            axis: axisValue,
            count: Number.isFinite(countValue) ? Math.max(1, Math.floor(countValue)) : 1,
            offset: Number.isFinite(offsetValue) ? offsetValue : 1,
        }];
    });

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
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    meshPath: string;
    physics?: PhysicsProps | undefined;
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

function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => `${key}:${stableSerialize(entry)}`);
        return `{${entries.join(',')}}`;
    }

    return JSON.stringify(value);
}

function getPhysicsSignature(physics?: PhysicsProps) {
    return physics ? stableSerialize(physics) : 'none';
}

function hasPhysics(instance: InstanceData): instance is InstanceData & { physics: PhysicsProps } {
    return Boolean(instance.physics);
}

function getColliderType(physics: PhysicsProps) {
    return physics.colliders || (physics.type === 'fixed' ? 'trimesh' : 'hull');
}

function emitSensorEnter(sourceId: string, payload: IntersectionEnterPayload) {
    gameEvents.emit('sensor:enter', {
        sourceEntityId: sourceId,
        targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
        targetRigidBody: payload.other.rigidBody,
    });
}

function emitSensorExit(sourceId: string, payload: IntersectionExitPayload) {
    gameEvents.emit('sensor:exit', {
        sourceEntityId: sourceId,
        targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
        targetRigidBody: payload.other.rigidBody,
    });
}

function emitCollisionEnter(sourceId: string, payload: CollisionPayload) {
    gameEvents.emit('collision:enter', {
        sourceEntityId: sourceId,
        targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
        targetRigidBody: payload.other.rigidBody,
    });
}

function emitCollisionExit(sourceId: string, payload: CollisionPayload) {
    gameEvents.emit('collision:exit', {
        sourceEntityId: sourceId,
        targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
        targetRigidBody: payload.other.rigidBody,
    });
}

function instanceEquals(a: InstanceData, b: InstanceData): boolean {
    return a.id === b.id &&
        a.sourceId === b.sourceId &&
        a.meshPath === b.meshPath &&
        arrayEquals(a.position, b.position) &&
        arrayEquals(a.rotation, b.rotation) &&
        arrayEquals(a.scale, b.scale) &&
        getPhysicsSignature(a.physics) === getPhysicsSignature(b.physics);
}

// --- Context ---
type GameInstanceContextType = {
    addInstance: (instance: InstanceData) => void;
    removeInstance: (id: string) => void;
    instances: InstanceData[];
    meshes: Record<string, Mesh>;
    modelParts?: Record<string, number>;
    hasInstance: (id: string) => boolean;
};
const GameInstanceContext = createContext<GameInstanceContextType | null>(null);

export function GameInstanceProvider({
    children,
    models,
    onSelect,
    registerRef,
    selectedId,
    editMode
}: {
    children: React.ReactNode,
    models: { [filename: string]: Object3D },
    onSelect?: (id: string | null) => void,
    registerRef?: (id: string, obj: Object3D | null) => void,
    selectedId?: string | null,
    editMode?: boolean
}) {
    const [instances, setInstances] = useState<InstanceData[]>([]);

    const addInstance = useCallback((instance: InstanceData) => {
        setInstances(prev => {
            const idx = prev.findIndex(i => i.id === instance.id);
            if (idx !== -1) {
                // Update existing if changed
                if (instanceEquals(prev[idx], instance)) {
                    return prev;
                }
                const copy = [...prev];
                copy[idx] = instance;
                return copy;
            }
            // Add new
            return [...prev, instance];
        });
    }, []);

    const removeInstance = useCallback((id: string) => {
        setInstances(prev => {
            if (!prev.find(i => i.id === id)) return prev;
            return prev.filter(i => i.id !== id);
        });
    }, []);

    const hasInstance = useCallback((id: string) => {
        return instances.some(i => i.id === id || i.sourceId === id);
    }, [instances]);

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

    // Group instances by meshPath and physics presence for batch rendering.
    const grouped = useMemo(() => {
        const groups: Record<string, { hasPhysics: boolean, instances: InstanceData[] }> = {};
        for (const inst of instances) {
            const key = `${inst.meshPath}__${inst.physics ? 'physics' : 'visual'}`;
            if (!groups[key]) groups[key] = { hasPhysics: Boolean(inst.physics), instances: [] };
            groups[key].instances.push(inst);
        }

        Object.values(groups).forEach(group => {
            group.instances.sort((a, b) => a.id.localeCompare(b.id));
        });

        return groups;
    }, [instances]);

    return (
        <GameInstanceContext.Provider
            value={{
                addInstance,
                removeInstance,
                instances,
                meshes: flatMeshes,
                modelParts,
                hasInstance
            }}
        >
            {/* Render normal prefab hierarchy (non-instanced objects) */}
            {children}

            {/* Render physics-enabled instanced groups using InstancedRigidBodies */}
            {Object.entries(grouped).map(([key, group]) => {
                if (!group.hasPhysics) return null;
                const modelKey = group.instances[0].meshPath;
                const partCount = modelParts[modelKey] || 0;
                if (partCount === 0) return null;

                return (
                    <InstancedRigidGroup
                        key={key}
                        group={group}
                        modelKey={modelKey}
                        partCount={partCount}
                        flatMeshes={flatMeshes}
                        onSelect={onSelect}
                        editMode={editMode}
                    />
                );
            })}

            {/* Render non-physics instanced visuals using Merged (one per model type) */}
            {Object.entries(grouped).map(([key, group]) => {
                if (group.hasPhysics) return null;

                const modelKey = group.instances[0].meshPath;
                const partCount = modelParts[modelKey] || 0;
                if (partCount === 0) return null;

                // Create mesh subset for this specific model
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
                            <NonPhysicsInstancedGroup
                                modelKey={modelKey}
                                group={group}
                                partCount={partCount}
                                instancesMap={instancesMap}
                                onSelect={onSelect}
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

// Render physics-enabled instances using InstancedRigidBodies
function InstancedRigidGroup({
    group,
    modelKey,
    partCount,
    flatMeshes,
    onSelect,
    editMode
}: {
    group: { hasPhysics: boolean, instances: InstanceData[] },
    modelKey: string,
    partCount: number,
    flatMeshes: Record<string, Mesh>,
    onSelect?: (id: string | null) => void,
    editMode?: boolean
}) {
    const meshRefs = useRef<(InstancedMesh | null)[]>([]);
    const rigidBodiesRef = useRef<(any | null)[] | null>(null);

    const instances = useMemo<InstancedRigidBodyProps[]>(
        () => group.instances.filter(hasPhysics).map(inst => {
            const { activeCollisionTypes: _activeCollisionTypes, colliders: _colliders, userData, ...rigidBodyProps } = inst.physics;

            return {
                key: inst.id,
                position: inst.position,
                rotation: inst.rotation,
                scale: inst.scale,
                ...rigidBodyProps,
                colliders: getColliderType(inst.physics) as any,
                userData: { ...(userData as Record<string, unknown> | undefined), entityId: inst.sourceId },
                onIntersectionEnter: (payload: IntersectionEnterPayload) => emitSensorEnter(inst.sourceId, payload),
                onIntersectionExit: (payload: IntersectionExitPayload) => emitSensorExit(inst.sourceId, payload),
                onCollisionEnter: (payload: CollisionPayload) => emitCollisionEnter(inst.sourceId, payload),
                onCollisionExit: (payload: CollisionPayload) => emitCollisionExit(inst.sourceId, payload),
            };
        }),
        [group.instances]
    );

    // Apply scale to visual meshes (InstancedRigidBodies only scales colliders, not visuals)
    useEffect(() => {
        const matrix = new Matrix4();
        const pos = new Vector3();
        const quat = new Quaternion();
        const euler = new Euler();
        const scl = new Vector3();

        meshRefs.current.forEach(mesh => {
            if (!mesh) return;

            group.instances.forEach((inst, i) => {
                pos.set(...inst.position);
                euler.set(...inst.rotation);
                quat.setFromEuler(euler);
                scl.set(...inst.scale);
                matrix.compose(pos, quat, scl);
                mesh.setMatrixAt(i, matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
        });

        // Update rigid body positions when instances change
        if (rigidBodiesRef.current) {
            try {
                group.instances.forEach((inst, i) => {
                    const body = rigidBodiesRef.current?.[i];
                    if (body && body.setTranslation && body.setRotation) {
                        pos.set(...inst.position);
                        euler.set(...inst.rotation);
                        quat.setFromEuler(euler);
                        body.setTranslation(pos, false);
                        body.setRotation(quat, false);
                    }
                });
            } catch (error) {
                // Ignore errors when switching between instanced/non-instanced states
                console.warn('Failed to update rigidbody positions:', error);
            }
        }
    }, [group.instances]);

    useEffect(() => {
        group.instances.forEach((inst, i) => {
            if (!inst.physics || inst.physics.activeCollisionTypes !== 'all') return;

            const body = rigidBodiesRef.current?.[i];
            if (!body || !body.numColliders || !body.collider) return;

            for (let colliderIndex = 0; colliderIndex < body.numColliders(); colliderIndex++) {
                const collider = body.collider(colliderIndex);
                collider.setActiveCollisionTypes?.(
                    ActiveCollisionTypes.DEFAULT |
                    ActiveCollisionTypes.KINEMATIC_FIXED |
                    ActiveCollisionTypes.KINEMATIC_KINEMATIC
                );
            }
        });
    }, [group.instances]);

    // Handle click on instanced mesh in edit mode
    const handleClick = (e: any) => {
        if (!editMode || !onSelect) return;
        e.stopPropagation();

        // Get the instance index from the intersection
        const instanceId = e.instanceId;
        if (instanceId !== undefined && group.instances[instanceId]) {
            onSelect(group.instances[instanceId].sourceId);
        }
    };

    // Add key to force remount when instance count changes significantly (helps with cleanup)
    const rigidBodyKey = `rb_${modelKey}_${group.instances.map(inst => `${inst.id}:${getPhysicsSignature(inst.physics)}`).join('|')}`;

    return (
        <InstancedRigidBodies
            key={rigidBodyKey}
            ref={rigidBodiesRef}
            instances={instances}
        >
            {Array.from({ length: partCount }).map((_, i) => {
                const mesh = flatMeshes[`${modelKey}__${i}`];
                if (!mesh) return null;
                return (
                    <instancedMesh
                        key={i}
                        ref={el => { meshRefs.current[i] = el; }}
                        args={[mesh.geometry, mesh.material, group.instances.length]}
                        castShadow
                        receiveShadow
                        frustumCulled={false}
                        onClick={editMode ? handleClick : undefined}
                    />
                );
            })}
        </InstancedRigidBodies>
    );
}

// Render non-physics instances using Merged (instancing without rigid bodies)
function NonPhysicsInstancedGroup({
    modelKey,
    group,
    partCount,
    instancesMap,
    onSelect,
    registerRef,
    selectedId,
    editMode
}: {
    modelKey: string;
    group: { hasPhysics: boolean, instances: InstanceData[] };
    partCount: number;
    instancesMap: Record<string, React.ComponentType<any>>;
    onSelect?: (id: string | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    selectedId?: string | null;
    editMode?: boolean;
}) {
    // Pre-compute which Instance components exist for this model
    const InstanceComponents = useMemo(() =>
        Array.from({ length: partCount }, (_, i) => instancesMap[`${modelKey}__${i}`]).filter(Boolean),
        [instancesMap, modelKey, partCount]
    );

    return (
        <>
            {group.instances.map(inst => (
                <InstanceGroupItem
                    key={inst.id}
                    instance={inst}
                    InstanceComponents={InstanceComponents}
                    onSelect={onSelect}
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
    registerRef,
    selectedId,
    editMode
}: {
    instance: InstanceData;
    InstanceComponents: React.ComponentType<any>[];
    onSelect?: (id: string | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
    selectedId?: string | null;
    editMode?: boolean;
}) {
    const clickValid = useRef(false);
    const groupRef = useRef<Group>(null!);
    const isSelected = selectedId === instance.id || selectedId === instance.sourceId;

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
            onPointerDown={(e) => { e.stopPropagation(); clickValid.current = true; }}
            onPointerMove={() => { clickValid.current = false; }}
            onPointerUp={(e) => {
                if (clickValid.current) {
                    e.stopPropagation();
                    onSelect?.(instance.sourceId);
                }
                clickValid.current = false;
            }}
        >
            {InstanceComponents.map((Instance, i) => <Instance key={i} />)}
        </group>
    );
}


// Hook to check if an instance exists
export function useInstanceCheck(id: string): boolean {
    const ctx = useContext(GameInstanceContext);
    return ctx?.hasInstance(id) ?? false;
}

// GameInstance component: registers an instance for batch rendering (renders nothing itself)
export const GameInstance = React.forwardRef<Group, {
    id: string;
    sourceId?: string;
    modelUrl: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    physics?: PhysicsProps | undefined;
}>(({
    id,
    sourceId,
    modelUrl,
    position,
    rotation,
    scale,
    physics = undefined,
}, ref) => {
    const ctx = useContext(GameInstanceContext);
    const addInstance = ctx?.addInstance;
    const removeInstance = ctx?.removeInstance;

    const instance = useMemo<InstanceData>(() => ({
        id,
        sourceId: sourceId ?? id,
        meshPath: modelUrl,
        position,
        rotation,
        scale,
        physics,
    }), [id, sourceId, modelUrl, JSON.stringify(position), JSON.stringify(rotation), JSON.stringify(scale), getPhysicsSignature(physics)]);

    useEffect(() => {
        if (!addInstance || !removeInstance) return;
        addInstance(instance);
        return () => {
            removeInstance(instance.id);
        };
    }, [addInstance, removeInstance, instance]);

    // No visual rendering - provider handles all instanced visuals
    return null;
});