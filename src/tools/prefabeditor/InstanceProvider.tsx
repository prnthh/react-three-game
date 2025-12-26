import React, { createContext, useContext, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Merged, useHelper } from '@react-three/drei';
import { InstancedRigidBodies } from "@react-three/rapier";
import { Mesh, Matrix4, Object3D, Group, Vector3, Quaternion, Euler, InstancedMesh, BoxHelper } from "three";

// --- Types ---
export type InstanceData = {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    meshPath: string;
    physics?: { type: 'dynamic' | 'fixed' };
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
        a.meshPath === b.meshPath &&
        arrayEquals(a.position, b.position) &&
        arrayEquals(a.rotation, b.rotation) &&
        arrayEquals(a.scale, b.scale) &&
        a.physics?.type === b.physics?.type;
}

// --- Context ---
type GameInstanceContextType = {
    addInstance: (instance: InstanceData) => void;
    removeInstance: (id: string) => void;
    instances: InstanceData[];
    meshes: Record<string, Mesh>;
    modelParts?: Record<string, number>;
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

    // Group instances by meshPath + physics type for batch rendering
    const grouped = useMemo(() => {
        const groups: Record<string, { physicsType: string, instances: InstanceData[] }> = {};
        for (const inst of instances) {
            const type = inst.physics?.type || 'none';
            const key = `${inst.meshPath}__${type}`;
            if (!groups[key]) groups[key] = { physicsType: type, instances: [] };
            groups[key].instances.push(inst);
        }
        return groups;
    }, [instances]);

    return (
        <GameInstanceContext.Provider
            value={{
                addInstance,
                removeInstance,
                instances,
                meshes: flatMeshes,
                modelParts
            }}
        >
            {/* Render normal prefab hierarchy (non-instanced objects) */}
            {children}

            {/* Render physics-enabled instanced groups using InstancedRigidBodies */}
            {Object.entries(grouped).map(([key, group]) => {
                if (group.physicsType === 'none') return null;
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
                    />
                );
            })}

            {/* Render non-physics instanced visuals using Merged (one per model type) */}
            {Object.entries(grouped).map(([key, group]) => {
                if (group.physicsType !== 'none') return null;

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
    flatMeshes
}: {
    group: { physicsType: string, instances: InstanceData[] },
    modelKey: string,
    partCount: number,
    flatMeshes: Record<string, Mesh>
}) {
    const meshRefs = useRef<(InstancedMesh | null)[]>([]);

    const instances = useMemo(
        () => group.instances.map(inst => ({
            key: inst.id,
            position: inst.position,
            rotation: inst.rotation,
            scale: inst.scale,
        })),
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
    }, [group.instances]);

    const colliders = group.physicsType === 'fixed' ? 'trimesh' : 'hull';

    return (
        <InstancedRigidBodies
            instances={instances}
            colliders={colliders}
            type={group.physicsType as 'dynamic' | 'fixed'}
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
    group: { physicsType: string, instances: InstanceData[] };
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
    const isSelected = selectedId === instance.id;

    // Use BoxHelper when object is selected in edit mode
    useHelper(editMode && isSelected ? groupRef : null, BoxHelper, 'cyan');

    useEffect(() => {
        registerRef?.(instance.id, groupRef.current);
    }, [instance.id, registerRef]);

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
                    onSelect?.(instance.id);
                }
                clickValid.current = false;
            }}
        >
            {InstanceComponents.map((Instance, i) => <Instance key={i} />)}
        </group>
    );
}


// GameInstance component: registers an instance for batch rendering (renders nothing itself)
export const GameInstance = React.forwardRef<Group, {
    id: string;
    modelUrl: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    physics?: { type: 'dynamic' | 'fixed' };
}>(({
    id,
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
        meshPath: modelUrl,
        position,
        rotation,
        scale,
        physics,
    }), [id, modelUrl, position, rotation, scale, physics]);

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