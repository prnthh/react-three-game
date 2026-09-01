import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { DynamicDrawUsage, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Mesh, type Material, type Object3D } from 'three';
import type { Node } from 'three/webgpu';
import { instancedDynamicBufferAttribute, mat4 } from 'three/tsl';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEditSelection } from './SelectionRuntime';

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
const IDENTITY_MATRIX = new Matrix4();
const BATCH_PARENT_INVERSE = new Matrix4();
const SOURCE_WORLD_MATRIX = new Matrix4();
const INSTANCE_MATRIX = new Matrix4();
const CURRENT_INSTANCE_MATRIX = new Matrix4();
const INVERSE_MATRIX = new Matrix4();
export const MESH_INSTANCING_MATERIAL_FACTORY = 'prefabMeshInstancingMaterialFactory';

export type MeshInstancingMaterialFactory = (inverseInstanceMatrix: Node<'mat4'>) => Material;

export type InstancedMeshSource = {
    id: string;
    mesh: Mesh;
    host: Object3D | null;
};

class MeshInstanceRegistry {
    private sources = new Map<string, InstancedMeshSource>();
    private listeners = new Set<() => void>();
    private revision = 0;
    private scheduled = false;

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
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.revision += 1;
            this.listeners.forEach(listener => listener());
        });
    }
}

const MeshInstanceContext = createContext<MeshInstanceRegistry | null>(null);

function materialKey(material: Material | Material[]) {
    return Array.isArray(material) ? material.map(entry => entry.uuid).join(',') : material.uuid;
}

function equalsFloat32(left: Matrix4, right: Matrix4) {
    for (let index = 0; index < 16; index += 1) {
        if (left.elements[index] !== Math.fround(right.elements[index])) return false;
    }
    return true;
}

function getMeshInstancingMaterialFactory(material: Material | Material[]) {
    if (Array.isArray(material)) return null;
    const factory = material.userData[MESH_INSTANCING_MATERIAL_FACTORY];
    return typeof factory === 'function' ? factory as MeshInstancingMaterialFactory : null;
}

function isHierarchyVisible(source: InstancedMeshSource) {
    if (!source.mesh.visible) return false;
    let current: Object3D | null = source.mesh.parent ?? source.host;
    while (current) {
        if (!current.visible) return false;
        current = current.parent;
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
        batch.parent?.updateWorldMatrix(true, false);
        BATCH_PARENT_INVERSE.copy(batch.parent?.matrixWorld ?? IDENTITY_MATRIX).invert();
        let matricesChanged = false;
        let inverseMatricesChanged = false;
        for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            if (source.mesh.parent) {
                source.mesh.updateWorldMatrix(true, false);
                SOURCE_WORLD_MATRIX.copy(source.mesh.matrixWorld);
            } else if (source.host) {
                source.mesh.updateMatrix();
                SOURCE_WORLD_MATRIX
                    .multiplyMatrices(source.host.matrixWorld, source.mesh.matrix);
            }
            INSTANCE_MATRIX.multiplyMatrices(BATCH_PARENT_INVERSE, SOURCE_WORLD_MATRIX);
            const renderedMatrix = isHierarchyVisible(source) ? INSTANCE_MATRIX : HIDDEN_MATRIX;
            batch.getMatrixAt(index, CURRENT_INSTANCE_MATRIX);
            if (!equalsFloat32(CURRENT_INSTANCE_MATRIX, renderedMatrix)) {
                batch.setMatrixAt(index, renderedMatrix);
                matricesChanged = true;
            }
            if (inverseMatrixBuffer) {
                INVERSE_MATRIX.copy(INSTANCE_MATRIX).invert();
                const offset = index * 16;
                for (let component = 0; component < 16; component += 1) {
                    const value = Math.fround(INVERSE_MATRIX.elements[component]);
                    if (inverseMatrixBuffer.array[offset + component] === value) continue;
                    inverseMatrixBuffer.array[offset + component] = value;
                    inverseMatricesChanged = true;
                }
            }
        }
        if (matricesChanged) batch.instanceMatrix.needsUpdate = true;
        if (inverseMatrixBuffer && inverseMatricesChanged) inverseMatrixBuffer.needsUpdate = true;
    }, [inverseMatrixBuffer, sources]);

    useFrame(() => updateMatrices());

    useLayoutEffect(() => {
        updateMatrices();
        sources.forEach(source => {
            source.host?.remove(source.mesh);
        });
        return () => {
            sources.forEach(source => {
                if (source.host && !source.mesh.parent) source.host.add(source.mesh);
            });
        };
    }, [sources, updateMatrices]);

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
        frustumCulled={false}
        onClick={handleClick}
    />;
}

function MeshInstanceBatches({ registry }: { registry: MeshInstanceRegistry }) {
    useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
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
        if (!registry || !mesh || !enabled || !mesh.geometry || !mesh.material || mesh.children.length > 0) return;
        return registry.register({
            id,
            mesh,
            host: mesh.parent,
        });
    }, [enabled, id, mesh, registry]);
}

const NOOP = () => {};

/** Rebuilds instance batches after a custom material changes its instancing contract. */
export function useInvalidateMeshInstances() {
    return useContext(MeshInstanceContext)?.invalidate ?? NOOP;
}
