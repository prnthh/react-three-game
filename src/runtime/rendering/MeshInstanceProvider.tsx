import { SpatialGrid, DEFAULT_SPATIAL_CELL_SIZE } from '../spatial/SpatialGrid.js';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { DynamicDrawUsage, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Mesh, Vector3, type Material, type Object3D } from 'three';
import { instancedDynamicBufferAttribute, mat4 } from 'three/tsl';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { EditPickContext } from '../scene/SelectionRuntime.js';
import { registerRenderSources } from '../scene/gameObject.js';
import { getInstancedMaterialFactory } from './materialInstancing.js';

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

/** Own source layer masks while a batch is mounted; mirrored transforms can opt out per frame. */
export function manageInstancedSourceVisibility(sources: InstancedMeshSource[]) {
    const masks = sources.map(source => source.mesh.layers.mask);
    return {
        setBatched(index: number, batched: boolean) {
            sources[index].mesh.layers.mask = batched ? 0 : masks[index];
        },
        restore() {
            sources.forEach((source, index) => { source.mesh.layers.mask = masks[index]; });
        },
    };
}

/** Keep source geometry available to physics while the batch draws it. */
export function hideInstancedSources(sources: InstancedMeshSource[]) {
    const visibility = manageInstancedSourceVisibility(sources);
    sources.forEach((_, index) => visibility.setBatched(index, true));
    return visibility.restore;
}

/** GPU instance matrices cannot change the draw's front-face winding independently. */
export function supportsInstanceMatrix(matrix: Matrix4) {
    return matrix.determinant() > 0;
}

class MeshInstanceRegistry {
    readonly spatial: SpatialGrid<InstancedMeshSource>;
    private position = new Vector3();
    constructor(readonly isStatic = false, cellSize = DEFAULT_SPATIAL_CELL_SIZE) { this.spatial = new SpatialGrid(cellSize); }

    updateSpatial() {
        if (this.isStatic) return;
        let changed = false;
        for (const source of this.sources.values()) {
            source.mesh.getWorldPosition(this.position);
            changed = this.spatial.update(source, this.position) || changed;
        }
        if (changed) this.changed();
    }
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
        const previous = this.sources.get(source.id);
        if (previous) this.spatial.remove(previous);
        this.sources.set(source.id, source);
        source.mesh.getWorldPosition(this.position);
        this.spatial.update(source, this.position);
        this.changed();
        return () => {
            if (this.sources.get(source.id)?.mesh !== source.mesh) return;
            this.sources.delete(source.id);
            this.spatial.remove(source);
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
const MeshInstancingEnabled = createContext(true);

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
    return `${geometryKey}|${materialKey(mesh.material)}|${Number(mesh.castShadow)}|${Number(mesh.receiveShadow)}|${Number(mesh.frustumCulled)}`;
}

function MeshInstanceBatch({ sources, isStatic }: { sources: InstancedMeshSource[]; isStatic: boolean }) {
    const batchRef = useRef<InstancedMesh>(null);
    const sourceVisibility = useRef<ReturnType<typeof manageInstancedSourceVisibility> | null>(null);
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
            // Reflection needs the ordinary mesh draw's winding correction. Keep
            // its batch slot hidden and restore the source, including when an
            // authored or animated transform changes handedness after mounting.
            const batched = supportsInstanceMatrix(INSTANCE_MATRIX);
            sourceVisibility.current?.setBatched(index, batched);
            const renderedMatrix = batched && isHierarchyVisible(source) ? INSTANCE_MATRIX : HIDDEN_MATRIX;
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
            // Full geometry bounds keep oversized objects and shadow passes conservative.
            batch.computeBoundingSphere();
        }
        if (inverseMatrixBuffer && inverseMatricesChanged) inverseMatrixBuffer.needsUpdate = true;
    }, [inverseMatrixBuffer, sources, isStatic]);

    useFrame(() => updateMatrices());

    useLayoutEffect(() => {
        const visibility = manageInstancedSourceVisibility(sources);
        sourceVisibility.current = visibility;
        updateMatrices(true);
        return () => {
            visibility.restore();
            if (sourceVisibility.current === visibility) sourceVisibility.current = null;
        };
    }, [sources, updateMatrices]);

    useLayoutEffect(() => {
        if (batchRef.current) return registerRenderSources(batchRef.current, sources.map(source => source.mesh));
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
        frustumCulled={sources[0].mesh.frustumCulled}
        onClick={handleClick}
    />;
}

function MeshInstanceBatches({ registry }: { registry: MeshInstanceRegistry }) {
    useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
    useFrame(() => registry.updateSpatial());
    const groups = new Map<string, InstancedMeshSource[]>();
    for (const source of registry.getSources()) {
        const compatibleKey = getBatchKey(source);
        if (!compatibleKey) continue;
        const key = `${registry.spatial.cellOf(source)}|${compatibleKey}`;
        const group = groups.get(key);
        if (group) group.push(source);
        else groups.set(key, [source]);
    }

    return <>{[...groups.entries()].map(([key, sources]) => (
        sources.length > 1 ? <MeshInstanceBatch key={key} sources={sources} isStatic={registry.isStatic} /> : null
    ))}</>;
}

/** Owns one mesh bucket registry for the complete nested prefab tree. */
export const SpatialCellSizeContext = createContext(DEFAULT_SPATIAL_CELL_SIZE);

export function MeshInstanceProvider({ children, isolated = false, static: isStatic = false, enabled = true }: { children: ReactNode; isolated?: boolean; static?: boolean; enabled?: boolean }) {
    const parentEnabled = useContext(MeshInstancingEnabled);
    const active = parentEnabled && enabled;
    const cellSize = useContext(SpatialCellSizeContext);
    const parent = useContext(MeshInstanceContext);
    const inherited = isolated ? null : parent;
    const registry = useMemo(() => inherited ?? new MeshInstanceRegistry(isStatic, cellSize), [inherited, isStatic, cellSize]);
    if (inherited) return children;
    return (
        <MeshInstancingEnabled.Provider value={active}><MeshInstanceContext.Provider value={registry}>
            {children}
            {active && <MeshInstanceBatches registry={registry} />}
        </MeshInstanceContext.Provider></MeshInstancingEnabled.Provider>
    );
}

export function useMeshInstanceRegistration(id: string, meshRef: RefObject<Mesh | null>, enabled: boolean) {
    const instancingEnabled = useContext(MeshInstancingEnabled);
    const registry = useContext(MeshInstanceContext);
    const onEditClick = useContext(EditPickContext);
    const editClick = useRef(onEditClick);
    useLayoutEffect(() => { editClick.current = onEditClick; }, [onEditClick]);
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!instancingEnabled || !registry || !mesh || !enabled || !mesh.geometry || !mesh.material || mesh.children.length > 0) return;
        return registry.register({
            id,
            mesh,
            onEditClick: event => editClick.current?.(event),
        });
    }, [enabled, instancingEnabled, id, meshRef, registry]);
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
