import { SpatialGrid, DEFAULT_SPATIAL_CELL_SIZE } from '../spatial/SpatialGrid.js';
import { DynamicDrawUsage, Group, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Mesh, Vector3, type Material, type Object3D } from 'three';
import { instancedDynamicBufferAttribute, mat4 } from 'three/tsl';
import type { ThreeEvent } from '@react-three/fiber';
import { registerRenderSources } from '../scene/gameObject.js';
import { getInstancedMaterialFactory } from './materialInstancing.js';

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
const IDENTITY_MATRIX = new Matrix4();
const BATCH_PARENT_INVERSE = new Matrix4();
const INSTANCE_MATRIX = new Matrix4();
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

function materialKey(material: Material | Material[]) {
    return Array.isArray(material) ? material.map(entry => entry.uuid).join(',') : material.uuid;
}

/** Compare at GPU precision and upload only changed matrix entries. */
function writeMatrix(array: { [index: number]: number }, offset: number, matrix: Matrix4) {
    let changed = false;
    for (let index = 0; index < 16; index++) {
        const value = Math.fround(matrix.elements[index]);
        if (array[offset + index] === value) continue;
        array[offset + index] = value;
        changed = true;
    }
    return changed;
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

class MeshInstanceBatch {
    readonly mesh: InstancedMesh;
    readonly factory;
    private inverseMatrixBuffer: InstancedInterleavedBuffer | null = null;
    private sourceVisibility: ReturnType<typeof manageInstancedSourceVisibility> | null = null;
    private unregisterSources = () => {};
    private lastParentMatrix = new Matrix4();
    private lastVisibility: boolean | null = null;
    sources: InstancedMeshSource[] = [];

    constructor(sources: InstancedMeshSource[], private isStatic: boolean) {
        const source = sources[0].mesh;
        const capacity = Math.max(2, 2 ** Math.ceil(Math.log2(sources.length)));
        this.factory = getInstancedMaterialFactory(source.material);
        let material = source.material;
        if (this.factory) {
            const buffer = this.inverseMatrixBuffer = new InstancedInterleavedBuffer(new Float32Array(capacity * 16), 16, 1);
            buffer.setUsage(DynamicDrawUsage);
            material = this.factory(mat4(
                instancedDynamicBufferAttribute(buffer, 'vec4', 16, 0),
                instancedDynamicBufferAttribute(buffer, 'vec4', 16, 4),
                instancedDynamicBufferAttribute(buffer, 'vec4', 16, 8),
                instancedDynamicBufferAttribute(buffer, 'vec4', 16, 12),
            ));
        }
        this.mesh = new InstancedMesh(source.geometry, material, capacity);
        this.mesh.castShadow = source.castShadow;
        this.mesh.receiveShadow = source.receiveShadow;
        this.mesh.frustumCulled = source.frustumCulled;
    }

    setSources(sources: InstancedMeshSource[]) {
        this.sourceVisibility?.restore();
        this.unregisterSources();
        this.sources = sources;
        this.sourceVisibility = manageInstancedSourceVisibility(sources);
        this.unregisterSources = registerRenderSources(this.mesh, sources.map(source => source.mesh));
        if (sources.length) this.update(true);
        else this.mesh.count = 0;
    }

    update(force = false) {
        const { mesh: batch, sources, isStatic, inverseMatrixBuffer } = this;
        batch.count = sources.length;
        batch.parent?.updateWorldMatrix(true, false);
        const parentMatrix = batch.parent?.matrixWorld ?? IDENTITY_MATRIX;
        let visible = true;
        for (let parent = batch.parent; parent; parent = parent.parent) visible = visible && parent.visible;
        if (isStatic && !force && this.lastVisibility === visible && this.lastParentMatrix.equals(parentMatrix)) return;
        this.lastParentMatrix.copy(parentMatrix);
        this.lastVisibility = visible;
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
            this.sourceVisibility?.setBatched(index, batched);
            const renderedMatrix = batched && isHierarchyVisible(source) ? INSTANCE_MATRIX : HIDDEN_MATRIX;
            matricesChanged = writeMatrix(batch.instanceMatrix.array, index * 16, renderedMatrix) || matricesChanged;
            if (inverseMatrixBuffer) {
                INVERSE_MATRIX.copy(INSTANCE_MATRIX).invert();
                inverseMatricesChanged = writeMatrix(inverseMatrixBuffer.array, index * 16, INVERSE_MATRIX) || inverseMatricesChanged;
            }
        }
        if (matricesChanged) {
            batch.instanceMatrix.needsUpdate = true;
            // Full geometry bounds keep oversized objects and shadow passes conservative.
            batch.computeBoundingSphere();
        }
        if (inverseMatrixBuffer && inverseMatricesChanged) inverseMatrixBuffer.needsUpdate = true;
    }

    dispose() {
        this.sourceVisibility?.restore();
        this.unregisterSources();
        this.mesh.removeFromParent();
        this.mesh.dispose();
        if (this.factory && !Array.isArray(this.mesh.material)) this.mesh.material.dispose();
    }
}

/** Owns GPU batches directly. React only registers sources and mounts the container. */
export class MeshInstanceRegistry {
    readonly spatial: SpatialGrid<InstancedMeshSource>;
    private sources = new Map<string, InstancedMeshSource>();
    private batches = new Map<string, MeshInstanceBatch>();
    private hits = new Map<Object3D, MeshInstanceBatch>();
    private root: Group | null = null;
    private position = new Vector3();
    private listeners = new Set<() => void>();
    private revision = 0;
    private scheduled = false;
    private dirty = true;
    // Tiny WebGPU batches multiply per-instance shader builds for little draw-call benefit.
    constructor(readonly isStatic = false, cellSize = DEFAULT_SPATIAL_CELL_SIZE, readonly minInstances = 8) {
        this.spatial = new SpatialGrid(cellSize);
    }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getSnapshot = () => this.revision;
    connect(root: Group) {
        this.root = root;
        this.invalidate();
        return () => {
            this.root = null;
            this.batches.forEach(batch => batch.dispose());
            this.batches.clear();
            this.hits.clear();
        };
    }
    register(source: InstancedMeshSource) {
        const previous = this.sources.get(source.id);
        if (previous) this.spatial.remove(previous);
        this.sources.set(source.id, source);
        source.mesh.getWorldPosition(this.position);
        this.spatial.update(source, this.position);
        this.invalidate();
        return () => {
            if (this.sources.get(source.id) !== source) return;
            this.sources.delete(source.id);
            this.spatial.remove(source);
            this.invalidate();
        };
    }
    invalidate = () => {
        this.dirty = true;
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.reconcile();
            this.revision++;
            this.listeners.forEach(listener => listener());
        });
    };
    update() {
        if (!this.isStatic) for (const source of this.sources.values()) {
            source.mesh.getWorldPosition(this.position);
            if (this.spatial.update(source, this.position)) this.invalidate();
        }
        this.reconcile();
        this.batches.forEach(batch => batch.update());
    }
    private reconcile() {
        if (!this.root || !this.dirty) return;
        this.dirty = false;
        const groups = new Map<string, InstancedMeshSource[]>();
        for (const source of this.sources.values()) {
            const compatible = getBatchKey(source);
            if (!compatible) continue;
            const key = `${this.spatial.cellOf(source)}|${compatible}`;
            const group = groups.get(key);
            if (group) group.push(source); else groups.set(key, [source]);
        }
        // Release old ownership before assigning moved sources to their new batches.
        for (const [key, batch] of this.batches) {
            const sources = groups.get(key);
            if (!sources || sources.length < this.minInstances || sources.length > batch.mesh.instanceMatrix.count
                || batch.factory !== getInstancedMaterialFactory(sources[0].mesh.material)) {
                batch.dispose(); this.hits.delete(batch.mesh); this.batches.delete(key);
            } else if (sources.length !== batch.sources.length || sources.some((source, i) => source !== batch.sources[i])) {
                batch.setSources([]);
            }
        }
        for (const [key, sources] of groups) {
            if (sources.length < this.minInstances) continue;
            let batch = this.batches.get(key);
            if (!batch) {
                batch = new MeshInstanceBatch(sources, this.isStatic);
                this.batches.set(key, batch); this.hits.set(batch.mesh, batch);
                this.root.add(batch.mesh);
            }
            if (!batch.sources.length) batch.setSources(sources);
        }
    }
    handleClick = (event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4 || event.instanceId == null) return;
        this.hits.get(event.object)?.sources[event.instanceId]?.onEditClick?.(event);
    };
}
