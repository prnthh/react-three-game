import React, { createContext, useContext, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Merged } from '@react-three/drei';
import * as THREE from 'three';
import { InstancedRigidBodies } from "@react-three/rapier";

// --- Types ---
export type InstanceData = {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    meshPath: string;
    physics?: { type: 'dynamic' | 'fixed' };
};

function arrayEquals(a: number[], b: number[]) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function instanceEquals(a: InstanceData, b: InstanceData) {
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
    meshes: Record<string, THREE.Mesh>;
    instancesMap?: Record<string, React.ComponentType<any>>;
    modelParts?: Record<string, number>;
};
const GameInstanceContext = createContext<GameInstanceContextType | null>(null);

export function GameInstanceProvider({
    children,
    models
    , onSelect, registerRef
}: {
    children: React.ReactNode,
    models: { [filename: string]: THREE.Object3D },
    onSelect?: (id: string | null) => void,
    registerRef?: (id: string, obj: THREE.Object3D | null) => void,
}) {
    const [instances, setInstances] = useState<InstanceData[]>([]);

    const addInstance = useCallback((instance: InstanceData) => {
        setInstances(prev => {
            const idx = prev.findIndex(i => i.id === instance.id);
            if (idx !== -1) {
                if (instanceEquals(prev[idx], instance)) {
                    return prev;
                }
                const copy = [...prev];
                copy[idx] = instance;
                return copy;
            }
            return [...prev, instance];
        });
    }, []);

    const removeInstance = useCallback((id: string) => {
        setInstances(prev => {
            if (!prev.find(i => i.id === id)) return prev;
            return prev.filter(i => i.id !== id);
        });
    }, []);

    // Flatten all model meshes once
    const { flatMeshes, modelParts } = useMemo(() => {
        const flatMeshes: Record<string, THREE.Mesh> = {};
        const modelParts: Record<string, number> = {};

        Object.entries(models).forEach(([modelKey, model]) => {
            const root = model;
            root.updateWorldMatrix(false, true);
            const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

            let partIndex = 0;

            root.traverse((obj: any) => {
                if (obj.isMesh) {
                    const geom = obj.geometry.clone();

                    const relativeTransform = obj.matrixWorld.clone().premultiply(rootInverse);
                    geom.applyMatrix4(relativeTransform);

                    const partKey = `${modelKey}__${partIndex}`;
                    flatMeshes[partKey] = new THREE.Mesh(geom, obj.material);
                    partIndex++;
                }
            });
            modelParts[modelKey] = partIndex;
        });

        return { flatMeshes, modelParts };
    }, [models]);

    // Group instances by meshPath + physics type
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
            {/* 1) Normal prefab hierarchy: NOT inside any <Merged> */}
            {children}

            {/* 2) Physics instanced groups: no <Merged>, just InstancedRigidBodies */}
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

            {/* 3) Non-physics instanced visuals: own <Merged> per model */}
            {Object.entries(grouped).map(([key, group]) => {
                if (group.physicsType !== 'none') return null;

                const modelKey = group.instances[0].meshPath;
                const partCount = modelParts[modelKey] || 0;
                if (partCount === 0) return null;

                // Restrict meshes to just this model's parts for this Merged
                const meshesForModel: Record<string, THREE.Mesh> = {};
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
                            />
                        )}
                    </Merged>
                );
            })}
        </GameInstanceContext.Provider>
    );
}

// Physics instancing stays the same
function InstancedRigidGroup({
    group,
    modelKey,
    partCount,
    flatMeshes
}: {
    group: { physicsType: string, instances: InstanceData[] },
    modelKey: string,
    partCount: number,
    flatMeshes: Record<string, THREE.Mesh>
}) {
    const instances = useMemo(
        () => group.instances.map(inst => ({
            key: inst.id,
            position: inst.position,
            rotation: inst.rotation,
            scale: inst.scale,
        })),
        [group.instances]
    );

    return (
        <InstancedRigidBodies
            instances={instances}
            colliders={group.physicsType === 'fixed' ? 'trimesh' : 'hull'}
            type={group.physicsType as 'dynamic' | 'fixed'}
        >
            {Array.from({ length: partCount }).map((_, i) => {
                const mesh = flatMeshes[`${modelKey}__${i}`];
                return (
                    <instancedMesh
                        key={i}
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

// Non-physics instanced visuals: per-instance group using Merged's Instance components
function NonPhysicsInstancedGroup({
    modelKey,
    group,
    partCount,
    instancesMap
    , onSelect, registerRef
}: {
    modelKey: string;
    group: { physicsType: string, instances: InstanceData[] };
    partCount: number;
    instancesMap: Record<string, React.ComponentType<any>>;
    onSelect?: (id: string | null) => void;
    registerRef?: (id: string, obj: THREE.Object3D | null) => void;
}) {
    const clickValid = useRef(false);
    const handlePointerDown = (e: any) => { e.stopPropagation(); clickValid.current = true; };
    const handlePointerMove = () => { if (clickValid.current) clickValid.current = false; };
    const handlePointerUp = (e: any, id: string) => {
        if (clickValid.current) {
            e.stopPropagation();
            onSelect?.(id);
        }
        clickValid.current = false;
    };

    return (
        <>
            {group.instances.map(inst => (
                <group
                    key={inst.id}
                    ref={(el) => { registerRef?.(inst.id, el as unknown as THREE.Object3D | null); }}
                    position={inst.position}
                    rotation={inst.rotation}
                    scale={inst.scale}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={(e) => handlePointerUp(e, inst.id)}
                >
                    {Array.from({ length: partCount }).map((_, i) => {
                        const Instance = instancesMap[`${modelKey}__${i}`];
                        if (!Instance) return null;
                        return <Instance key={i} />;
                    })}
                </group>
            ))}
        </>
    );
}


// --- GameInstance: just registers an instance, renders nothing ---
export const GameInstance = React.forwardRef<THREE.Group, {
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


    // No visual here – provider will render visuals for all instances
    return null;
});
