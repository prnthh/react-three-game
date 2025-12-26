import React, { createContext, useContext, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Merged } from '@react-three/drei';
import { InstancedRigidBodies, RigidBodyProps } from "@react-three/rapier";
import { Mesh, Matrix4, Object3D } from "three";

// --- Types ---
export type InstanceData = {
    id: string;
    meshPath: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    physics?: { type: RigidBodyProps['type'] };
};

type GroupedInstances = Record<string, {
    physicsType: string;
    instances: InstanceData[];
}>;

type GameInstanceContextType = {
    addInstance: (instance: InstanceData) => void;
    removeInstance: (id: string) => void;
};

// --- Helpers ---
const tupleEqual = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

const instanceChanged = (a: InstanceData, b: InstanceData) =>
    a.meshPath !== b.meshPath ||
    a.physics?.type !== b.physics?.type ||
    !tupleEqual(a.position, b.position) ||
    !tupleEqual(a.rotation, b.rotation) ||
    !tupleEqual(a.scale, b.scale);

function extractMeshParts(model: Object3D): Mesh[] {
    model.updateWorldMatrix(false, true);
    const rootInverse = new Matrix4().copy(model.matrixWorld).invert();
    const parts: Mesh[] = [];

    model.traverse(child => {
        if ((child as Mesh).isMesh) {
            const mesh = child as Mesh;
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld.clone().premultiply(rootInverse));
            parts.push(new Mesh(geometry, mesh.material));
        }
    });

    return parts;
}

// --- Context ---
const GameInstanceContext = createContext<GameInstanceContextType | null>(null);

// --- Provider ---
export function GameInstanceProvider({
    children,
    models,
    onSelect,
    registerRef
}: {
    children: React.ReactNode;
    models: Record<string, Object3D>;
    onSelect?: (id: string | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
}) {
    const [instances, setInstances] = useState<InstanceData[]>([]);

    const addInstance = useCallback((instance: InstanceData) => {
        setInstances(prev => {
            const idx = prev.findIndex(i => i.id === instance.id);
            if (idx === -1) return [...prev, instance];
            if (!instanceChanged(prev[idx], instance)) return prev;
            const updated = [...prev];
            updated[idx] = instance;
            return updated;
        });
    }, []);

    const removeInstance = useCallback((id: string) => {
        setInstances(prev => prev.filter(i => i.id !== id));
    }, []);

    // Extract mesh parts from models with baked local transforms
    const { meshParts, partCounts } = useMemo(() => {
        const meshParts: Record<string, Mesh> = {};
        const partCounts: Record<string, number> = {};

        Object.entries(models).forEach(([modelKey, model]) => {
            const parts = extractMeshParts(model);
            parts.forEach((mesh, i) => {
                meshParts[`${modelKey}__${i}`] = mesh;
            });
            partCounts[modelKey] = parts.length;
        });

        return { meshParts, partCounts };
    }, [models]);

    // Cleanup cloned geometries
    useEffect(() => () => {
        Object.values(meshParts).forEach(mesh => mesh.geometry.dispose());
    }, [meshParts]);

    // Group instances by model + physics type
    const grouped = useMemo<GroupedInstances>(() => {
        const groups: GroupedInstances = {};
        instances.forEach(inst => {
            const physicsType = inst.physics?.type ?? 'none';
            const key = `${inst.meshPath}__${physicsType}`;
            groups[key] ??= { physicsType, instances: [] };
            groups[key].instances.push(inst);
        });
        return groups;
    }, [instances]);

    const contextValue = useMemo(() => ({ addInstance, removeInstance }), [addInstance, removeInstance]);

    return (
        <GameInstanceContext.Provider value={contextValue}>
            {children}

            {Object.entries(grouped).map(([key, group]) => {
                const modelKey = group.instances[0].meshPath;
                const partCount = partCounts[modelKey] ?? 0;
                if (partCount === 0) return null;

                if (group.physicsType !== 'none') {
                    return (
                        <PhysicsInstances
                            key={key}
                            instances={group.instances}
                            physicsType={group.physicsType as RigidBodyProps['type']}
                            modelKey={modelKey}
                            partCount={partCount}
                            meshParts={meshParts}
                        />
                    );
                }

                const modelMeshes = Object.fromEntries(
                    Array.from({ length: partCount }, (_, i) => [`${modelKey}__${i}`, meshParts[`${modelKey}__${i}`]])
                );

                return (
                    <Merged key={key} meshes={modelMeshes} castShadow receiveShadow>
                        {(Components: Record<string, React.ComponentType>) => (
                            <StaticInstances
                                instances={group.instances}
                                modelKey={modelKey}
                                partCount={partCount}
                                Components={Components}
                                onSelect={onSelect}
                                registerRef={registerRef}
                            />
                        )}
                    </Merged>
                );
            })}
        </GameInstanceContext.Provider>
    );
}

// --- Physics Instances ---
// InstancedRigidBodies handles position/rotation/scale via the instances prop.
// We pass scale in instances and let the library manage matrix updates.
function PhysicsInstances({
    instances,
    physicsType,
    modelKey,
    partCount,
    meshParts
}: {
    instances: InstanceData[];
    physicsType: RigidBodyProps['type'];
    modelKey: string;
    partCount: number;
    meshParts: Record<string, Mesh>;
}) {
    // InstancedRigidBodies expects { key, position, rotation, scale }
    const rigidBodyInstances = useMemo(() =>
        instances.map(({ id, position, rotation, scale }) => ({ key: id, position, rotation, scale })),
        [instances]
    );

    return (
        <InstancedRigidBodies
            instances={rigidBodyInstances}
            type={physicsType}
            colliders={physicsType === 'fixed' ? 'trimesh' : 'hull'}
        >
            {Array.from({ length: partCount }, (_, i) => {
                const mesh = meshParts[`${modelKey}__${i}`];
                return mesh ? (
                    <instancedMesh
                        key={i}
                        args={[mesh.geometry, mesh.material, instances.length]}
                        frustumCulled={false}
                        castShadow
                        receiveShadow
                    />
                ) : null;
            })}
        </InstancedRigidBodies>
    );
}

// --- Static Instances (non-physics) ---
function StaticInstances({
    instances,
    modelKey,
    partCount,
    Components,
    onSelect,
    registerRef
}: {
    instances: InstanceData[];
    modelKey: string;
    partCount: number;
    Components: Record<string, React.ComponentType>;
    onSelect?: (id: string | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
}) {
    const Parts = useMemo(() =>
        Array.from({ length: partCount }, (_, i) => Components[`${modelKey}__${i}`]).filter(Boolean),
        [Components, modelKey, partCount]
    );

    return (
        <>
            {instances.map(inst => (
                <InstanceItem key={inst.id} instance={inst} Parts={Parts} onSelect={onSelect} registerRef={registerRef} />
            ))}
        </>
    );
}

// --- Single Instance ---
function InstanceItem({
    instance,
    Parts,
    onSelect,
    registerRef
}: {
    instance: InstanceData;
    Parts: React.ComponentType[];
    onSelect?: (id: string | null) => void;
    registerRef?: (id: string, obj: Object3D | null) => void;
}) {
    const moved = useRef(false);

    return (
        <group
            ref={el => registerRef?.(instance.id, el)}
            position={instance.position}
            rotation={instance.rotation}
            scale={instance.scale}
            onPointerDown={e => { e.stopPropagation(); moved.current = false; }}
            onPointerMove={() => { moved.current = true; }}
            onPointerUp={e => { e.stopPropagation(); if (!moved.current) onSelect?.(instance.id); }}
        >
            {Parts.map((Part, i) => <Part key={i} />)}
        </group>
    );
}

// --- GameInstance (declarative registration) ---
export function GameInstance({
    id,
    modelUrl,
    position,
    rotation,
    scale,
    physics
}: {
    id: string;
    modelUrl: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    physics?: { type: RigidBodyProps['type'] };
}) {
    const ctx = useContext(GameInstanceContext);

    const instance = useMemo<InstanceData>(() => ({
        id,
        meshPath: modelUrl,
        position,
        rotation,
        scale,
        physics,
    }), [id, modelUrl, position, rotation, scale, physics]);

    useEffect(() => {
        if (!ctx) return;
        ctx.addInstance(instance);
        return () => ctx.removeInstance(id);
    }, [ctx, instance, id]);

    return null;
}
