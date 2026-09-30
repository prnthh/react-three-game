import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { DynamicDrawUsage, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Mesh, type Material, type Object3D } from 'three';
import { instancedDynamicBufferAttribute, mat4 } from 'three/tsl';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { EditPickContext } from './SelectionRuntime';
import { registerEditPickSources } from './editPicking';
import { getInstancedMaterialFactory } from './materialInstancing';

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
const IDENTITY_MATRIX = new Matrix4();
const BATCH_PARENT_INVERSE = new Matrix4();
const INSTANCE_MATRIX = new Matrix4();
const CURRENT_INSTANCE_MATRIX = new Matrix4();
const INVERSE_MATRIX = new Matrix4();
export type InstancedMeshSource = {
    id: string;
    mesh: Mesh;
    onEditClick?: (event: ThreeEvent<MouseEvent>) => void;
};

/** Keep source geometry available to physics while the batch draws it. */
export function hideInstancedSources(sources: InstancedMeshSource[]) {
    const masks = sources.map(source => source.mesh.layers.mask);
    sources.forEach(source => { source.mesh.layers.mask = 0; });
    return () => {
        sources.forEach((source, index) => { source.mesh.layers.mask = masks[index]; });
    };
}

class MeshInstanceRegistry {
    constructor(readonly isStatic = false) {}
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

function isHierarchyVisible(source: InstancedMeshSource) {
    if (!source.mesh.visible) return false;
    let current: Object3D | null = source.mesh.parent;
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

function MeshInstanceBatch({ sources, isStatic }: { sources: InstancedMeshSource[]; isStatic: boolean }) {
    const batchRef = useRef<InstancedMesh>(null);
    const lastParentMatrix = useRef(new Matrix4());
    const lastVisibility = useRef<boolean | null>(null);
    const geometry = sources[0].mesh.geometry;
    const sourceMaterial = sources[0].mesh.material;
    const materialFactory = getInstancedMaterialFactory(sourceMaterial);
    const capacity = Math.max(2, 2 ** Math.ceil(Math.log2(sources.length)));
    const inverseMatrixBuffer = useMemo(() => {
        if (!materialFactory) return null;
        const buffer = new InstancedInterleavedBuffer(new Float32Array(capacity * 16), 16, 1);
        buffer.setUsage(DynamicDrawUsage);
        return buffer;
    }, [materialFactory, capacity]);
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

    const updateMatrices = useCallback((force = false) => {
        const batch = batchRef.current;
        if (!batch) return;
        batch.count = sources.length;
        batch.parent?.updateWorldMatrix(true, false);
        const parentMatrix = batch.parent?.matrixWorld ?? IDENTITY_MATRIX;
        let visible = true;
        for (let parent = batch.parent; parent; parent = parent.parent) visible = visible && parent.visible;
        if (isStatic && !force && lastVisibility.current === visible && lastParentMatrix.current.equals(parentMatrix)) return;
        lastParentMatrix.current.copy(parentMatrix);
        lastVisibility.current = visible;
        BATCH_PARENT_INVERSE.copy(parentMatrix).invert();
        let matricesChanged = false;
        let inverseMatricesChanged = false;
        for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            source.mesh.updateWorldMatrix(true, false);
            INSTANCE_MATRIX.multiplyMatrices(BATCH_PARENT_INVERSE, source.mesh.matrixWorld);
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
        if (matricesChanged) {
            batch.instanceMatrix.needsUpdate = true;
            // Raycasting still uses this bound even when render culling is disabled.
            batch.computeBoundingSphere();
        }
        if (inverseMatrixBuffer && inverseMatricesChanged) inverseMatrixBuffer.needsUpdate = true;
    }, [inverseMatrixBuffer, sources, isStatic]);

    useFrame(() => updateMatrices());

    useLayoutEffect(() => {
        updateMatrices(true);
        return hideInstancedSources(sources);
    }, [sources, updateMatrices]);

    useLayoutEffect(() => {
        if (batchRef.current) return registerEditPickSources(batchRef.current, sources.map(source => source.mesh));
    }, [sources]);
    const handleClick = sources.some(source => source.onEditClick) ? (event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4 || event.instanceId == null) return;
        sources[event.instanceId]?.onEditClick?.(event);
    } : undefined;

    return <instancedMesh
        ref={batchRef}
        args={[geometry, material, capacity]}
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
        sources.length > 1 ? <MeshInstanceBatch key={key} sources={sources} isStatic={registry.isStatic} /> : null
    ))}</>;
}

/** Owns one mesh bucket registry for the complete nested prefab tree. */
export function MeshInstanceProvider({ children, isolated = false, static: isStatic = false }: { children: ReactNode; isolated?: boolean; static?: boolean }) {
    const parent = useContext(MeshInstanceContext);
    const inherited = isolated ? null : parent;
    const registry = useMemo(() => inherited ?? new MeshInstanceRegistry(isStatic), [inherited, isStatic]);
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
    const onEditClick = useContext(EditPickContext);
    useLayoutEffect(() => {
        if (!registry || !mesh || !enabled || !mesh.geometry || !mesh.material || mesh.children.length > 0) return;
        return registry.register({
            id,
            mesh,
            onEditClick,
        });
    }, [enabled, id, mesh, registry, onEditClick]);
}

const NOOP = () => {};

/** Rebuilds instance batches after a custom material changes its instancing contract. */
export function useInvalidateMeshInstances() {
    return useContext(MeshInstanceContext)?.invalidate ?? NOOP;
}

/** A committed batch revision is part of the chunk preparation lifecycle. */
export function useMeshInstanceRevision() {
    const registry = useContext(MeshInstanceContext);
    if (!registry) throw new Error("Mesh instance registry is unavailable");
    return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
}
