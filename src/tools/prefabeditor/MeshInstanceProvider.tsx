import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { DynamicDrawUsage, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Mesh, type Material, type Object3D } from 'three';
import type { Node } from 'three/webgpu';
import { instancedDynamicBufferAttribute, mat4 } from 'three/tsl';
import type { ThreeEvent } from '@react-three/fiber';
import { useEditSelection } from './SelectionRuntime';
import { PrefabEditorMode, useScene } from './SceneContext';
import { gameEvents } from './GameEvents';

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
const INVERSE_MATRIX = new Matrix4();
export const MESH_INSTANCES_CHANGED_EVENT = 'editor:mesh-instances-changed';
export const MESH_INSTANCE_MATERIALS_CHANGED_EVENT = 'runtime:mesh-instance-materials-changed';
export const MESH_INSTANCING_MATERIAL_FACTORY = 'prefabMeshInstancingMaterialFactory';

export type MeshInstancingMaterialFactory = (inverseInstanceMatrix: Node<'mat4'>) => Material;

export type InstancedMeshSource = {
    id: string;
    mesh: Mesh;
    host: Object3D | null;
    hostParent: Object3D | null;
    worldMatrix: Matrix4;
};

class MeshInstanceRegistry {
    private sources = new Map<string, InstancedMeshSource>();
    private listeners = new Set<() => void>();
    private revision = 0;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = () => this.revision;

    getSources() {
        return [...this.sources.values()];
    }

    invalidate = () => this.changed();

    register(source: InstancedMeshSource) {
        this.sources.set(source.id, source);
        this.changed();
        return () => {
            if (this.sources.get(source.id)?.mesh !== source.mesh) return;
            this.sources.delete(source.id);
            this.changed();
        };
    }

    private changed() {
        this.revision += 1;
        this.listeners.forEach(listener => listener());
    }
}

const MeshInstanceContext = createContext<MeshInstanceRegistry | null>(null);

function materialKey(material: Material | Material[]) {
    return Array.isArray(material) ? material.map(entry => entry.uuid).join(',') : material.uuid;
}

function getMeshInstancingMaterialFactory(material: Material | Material[]) {
    if (Array.isArray(material)) return null;
    const factory = material.userData[MESH_INSTANCING_MATERIAL_FACTORY];
    return typeof factory === 'function' ? factory as MeshInstancingMaterialFactory : null;
}

function isHierarchyVisible(source: InstancedMeshSource) {
    let current: Object3D | null = source.mesh.parent ?? source.host;
    while (current) {
        if (!current.visible) return false;
        current = current.parent ?? (current === source.host ? source.hostParent : null);
    }
    return true;
}

function getBatchKey(source: InstancedMeshSource) {
    const { mesh } = source;
    const geometryKey = mesh.geometry.userData.prefabGeometrySignature;
    if (typeof geometryKey !== 'string' || !mesh.material) return null;
    return `${geometryKey}|${materialKey(mesh.material)}|${Number(mesh.castShadow)}|${Number(mesh.receiveShadow)}`;
}

function MeshInstanceBatch({ sources }: { sources: InstancedMeshSource[] }) {
    const batchRef = useRef<InstancedMesh>(null);
    const select = useEditSelection();
    const editMode = useScene().mode === PrefabEditorMode.Edit;
    const geometry = sources[0].mesh.geometry;
    const sourceMaterial = sources[0].mesh.material;
    const materialFactory = getMeshInstancingMaterialFactory(sourceMaterial);
    const inverseMatrixBuffer = useMemo(() => {
        if (!materialFactory) return null;
        const buffer = new InstancedInterleavedBuffer(new Float32Array(sources.length * 16), 16, 1);
        buffer.setUsage(DynamicDrawUsage);
        return buffer;
    }, [materialFactory, sources.length]);
    const inverseMatrixNode = useMemo(() => inverseMatrixBuffer ? mat4(
        instancedDynamicBufferAttribute(inverseMatrixBuffer, 'vec4', 16, 0),
        instancedDynamicBufferAttribute(inverseMatrixBuffer, 'vec4', 16, 4),
        instancedDynamicBufferAttribute(inverseMatrixBuffer, 'vec4', 16, 8),
        instancedDynamicBufferAttribute(inverseMatrixBuffer, 'vec4', 16, 12),
    ) : null, [inverseMatrixBuffer]);
    const material = useMemo(
        () => materialFactory && inverseMatrixNode
            ? materialFactory(inverseMatrixNode)
            : sourceMaterial,
        [inverseMatrixNode, materialFactory, sourceMaterial],
    );

    useEffect(() => () => {
        if (material !== sourceMaterial && !Array.isArray(material)) material.dispose();
    }, [material, sourceMaterial]);

    const updateMatrices = useCallback(() => {
        const batch = batchRef.current;
        if (!batch) return;
        for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            if (source.mesh.parent) {
                source.mesh.updateWorldMatrix(true, false);
                source.worldMatrix.copy(source.mesh.matrixWorld);
            } else if (source.host && source.hostParent) {
                source.hostParent.updateWorldMatrix(true, false);
                source.host.updateMatrix();
                source.mesh.updateMatrix();
                source.worldMatrix
                    .multiplyMatrices(source.hostParent.matrixWorld, source.host.matrix)
                    .multiply(source.mesh.matrix);
            }
            batch.setMatrixAt(index, isHierarchyVisible(source) ? source.worldMatrix : HIDDEN_MATRIX);
            if (inverseMatrixBuffer) {
                INVERSE_MATRIX.copy(source.worldMatrix).invert();
                const offset = index * 16;
                for (let component = 0; component < 16; component += 1) {
                    inverseMatrixBuffer.array[offset + component] = INVERSE_MATRIX.elements[component];
                }
            }
        }
        batch.instanceMatrix.needsUpdate = true;
        if (inverseMatrixBuffer) inverseMatrixBuffer.needsUpdate = true;
        batch.computeBoundingSphere();
    }, [inverseMatrixBuffer, sources]);

    useLayoutEffect(() => {
        updateMatrices();
        sources.forEach(source => {
            source.mesh.visible = false;
            source.host?.remove(source.mesh);
            if (source.host && source.hostParent && source.host.children.length === 0) {
                source.hostParent.remove(source.host);
            }
        });
        return () => {
            sources.forEach(source => {
                if (source.host && !source.host.parent && source.hostParent) source.hostParent.add(source.host);
                if (source.host && !source.mesh.parent) source.host.add(source.mesh);
                source.mesh.visible = true;
            });
        };
    }, [sources, updateMatrices]);

    useEffect(() => {
        if (!editMode) return;
        let frame = 0;
        const stop = gameEvents.on(MESH_INSTANCES_CHANGED_EVENT, () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                updateMatrices();
            });
        });
        return () => {
            stop();
            if (frame) cancelAnimationFrame(frame);
        };
    }, [editMode, updateMatrices]);

    const handleClick = select ? (event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4 || event.instanceId == null) return;
        const source = sources[event.instanceId];
        if (!source) return;
        event.stopPropagation();
        // Nested prefab ids are scoped as placement/descendant. The outer editor
        // owns the placement node, while play-mode meshes with events are never batched.
        select(source.id.split('/')[0]);
    } : undefined;

    return <instancedMesh
        ref={batchRef}
        args={[geometry, material, sources.length]}
        castShadow={sources[0].mesh.castShadow}
        receiveShadow={sources[0].mesh.receiveShadow}
        onClick={handleClick}
    />;
}

function MeshInstanceBatches({ registry }: { registry: MeshInstanceRegistry }) {
    useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
    useLayoutEffect(() => gameEvents.on(MESH_INSTANCE_MATERIALS_CHANGED_EVENT, registry.invalidate), [registry]);
    const groups = new Map<string, InstancedMeshSource[]>();
    for (const source of registry.getSources()) {
        const key = getBatchKey(source);
        if (!key) continue;
        const group = groups.get(key);
        if (group) group.push(source);
        else groups.set(key, [source]);
    }

    return <>{[...groups.entries()].map(([key, sources]) => (
        sources.length > 1 ? <MeshInstanceBatch key={key} sources={sources} /> : null
    ))}</>;
}

/** Owns one mesh bucket registry for the complete nested prefab tree. */
export function MeshInstanceProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(MeshInstanceContext);
    const registry = useMemo(() => inherited ?? new MeshInstanceRegistry(), [inherited]);
    if (inherited) return children;
    return (
        <MeshInstanceContext.Provider value={registry}>
            {children}
            <MeshInstanceBatches registry={registry} />
        </MeshInstanceContext.Provider>
    );
}

export function useMeshInstanceRegistration(id: string, mesh: Mesh | null, enabled: boolean) {
    const registry = useContext(MeshInstanceContext);
    useLayoutEffect(() => {
        if (!registry || !mesh || !enabled || !mesh.geometry || !mesh.material) return;
        return registry.register({
            id,
            mesh,
            host: mesh.parent,
            hostParent: mesh.parent?.parent ?? null,
            worldMatrix: new Matrix4(),
        });
    }, [enabled, id, mesh, registry]);
}
