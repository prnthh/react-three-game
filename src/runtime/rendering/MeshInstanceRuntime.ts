import { spatialCellKey, DEFAULT_SPATIAL_CELL_SIZE } from '../spatial/spatialCell.js';
import { DynamicDrawUsage, Group, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Mesh, Vector3, type Material, type Object3D } from 'three';
import { instancedDynamicBufferAttribute, mat4 } from 'three/tsl';
import type { ThreeEvent } from '@react-three/fiber';
import { registerRenderSources } from '../scene/gameObject.js';
import { getInstancedMaterialFactory } from './materialInstancing.js';

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
const BATCH_PARENT_INVERSE = new Matrix4();
const INSTANCE_MATRIX = new Matrix4();
const INVERSE_MATRIX = new Matrix4();
export type InstancedMeshSource = {
    id: string;
    mesh: Mesh;
    onClick?: (event: ThreeEvent<MouseEvent>) => void;
};

type RegisteredSource = InstancedMeshSource & { cell: string };

/** Own source layer masks while a batch is mounted; mirrored transforms can opt out per frame. */
function manageInstancedSourceVisibility(sources: InstancedMeshSource[]) {
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

/** GPU instance matrices cannot change the draw's front-face winding independently. */
function supportsInstanceMatrix(matrix: Matrix4) {
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

function isHierarchyVisible(current: Object3D | null) {
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
    sources: InstancedMeshSource[] = [];

    constructor(sources: InstancedMeshSource[]) {
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
    }

    update(sourceMatricesCurrent: boolean) {
        const { mesh: batch, sources, inverseMatrixBuffer } = this;
        const countChanged = batch.count !== sources.length;
        batch.count = sources.length;
        let matricesChanged = false;
        let inverseMatricesChanged = false;
        for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            if (!sourceMatricesCurrent) source.mesh.updateWorldMatrix(true, false);
            INSTANCE_MATRIX.multiplyMatrices(BATCH_PARENT_INVERSE, source.mesh.matrixWorld);
            // Reflection needs the ordinary mesh draw's winding correction. Keep
            // its batch slot hidden and restore the source, including when an
            // authored or animated transform changes handedness after mounting.
            const batched = supportsInstanceMatrix(INSTANCE_MATRIX);
            this.sourceVisibility?.setBatched(index, batched);
            const renderedMatrix = batched && isHierarchyVisible(source.mesh) ? INSTANCE_MATRIX : HIDDEN_MATRIX;
            matricesChanged = writeMatrix(batch.instanceMatrix.array, index * 16, renderedMatrix) || matricesChanged;
            if (inverseMatrixBuffer) {
                INVERSE_MATRIX.copy(INSTANCE_MATRIX).invert();
                inverseMatricesChanged = writeMatrix(inverseMatrixBuffer.array, index * 16, INVERSE_MATRIX) || inverseMatricesChanged;
            }
        }
        if (matricesChanged) batch.instanceMatrix.needsUpdate = true;
        if (matricesChanged || countChanged) {
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
    private sources = new Map<string, RegisteredSource>();
    private batches = new Map<string, MeshInstanceBatch>();
    private hits = new Map<Object3D, MeshInstanceBatch>();
    private root: Group | null = null;
    private position = new Vector3();
    private listeners = new Set<() => void>();
    private revision = 0;
    private dirty = true;
    private wake?: () => void;
    private lastParentMatrix = new Matrix4();
    private lastVisibility = false;
    constructor(readonly isStatic = false, private readonly cellSize: number | null = DEFAULT_SPATIAL_CELL_SIZE) {
        if (cellSize !== null && (!Number.isFinite(cellSize) || cellSize <= 0)) throw new Error('Spatial cell size must be positive and finite');
    }
    private cellOf(mesh: Mesh) {
        return this.cellSize === null ? '' : spatialCellKey(mesh.getWorldPosition(this.position), this.cellSize);
    }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getSnapshot = () => this.revision;
    connect(root: Group, wake?: () => void) {
        this.wake = wake;
        this.root = root;
        this.invalidate();
        return () => {
            this.wake = undefined;
            this.root = null;
            this.batches.forEach(batch => batch.dispose());
            this.batches.clear();
            this.hits.clear();
        };
    }
    register(source: InstancedMeshSource) {
        const registered = { ...source, cell: this.isStatic ? this.cellOf(source.mesh) : '' };
        this.sources.set(source.id, registered);
        this.invalidate();
        return () => {
            if (this.sources.get(source.id) !== registered) return;
            this.sources.delete(source.id);
            this.invalidate();
        };
    }
    invalidate = () => { this.dirty = true; this.wake?.(); };
    update() {
        // getWorldPosition refreshes each source matrix during the migration scan.
        const scanCells = this.cellSize !== null && !this.isStatic;
        if (scanCells) for (const source of this.sources.values()) {
            const cell = this.cellOf(source.mesh);
            if (source.cell !== cell) { source.cell = cell; this.invalidate(); }
        }
        const changed = this.root !== null && this.dirty;
        this.reconcile();
        if (this.root && this.batches.size) {
            this.root.updateWorldMatrix(true, false);
            const matrix = this.root.matrixWorld;
            const visible = this.isStatic && isHierarchyVisible(this.root);
            if (!this.isStatic || changed || this.lastVisibility !== visible || !this.lastParentMatrix.equals(matrix)) {
                this.lastVisibility = visible;
                this.lastParentMatrix.copy(matrix);
                BATCH_PARENT_INVERSE.copy(matrix).invert();
                this.batches.forEach(batch => batch.update(scanCells));
            }
        }
        if (changed) { this.revision++; this.listeners.forEach(listener => listener()); }
        // A singleton dynamic source may still migrate into another source's cell.
        return this.dirty || (this.isStatic ? this.batches.size > 0 : this.sources.size > 0);
    }
    private reconcile() {
        if (!this.root || !this.dirty) return;
        this.dirty = false;
        const groups = new Map<string, InstancedMeshSource[]>();
        for (const source of this.sources.values()) {
            const compatible = getBatchKey(source);
            if (!compatible) continue;
            const key = `${source.cell}|${compatible}`;
            const group = groups.get(key);
            if (group) group.push(source); else groups.set(key, [source]);
        }
        // Release old ownership before assigning moved sources to their new batches.
        for (const [key, batch] of this.batches) {
            const sources = groups.get(key);
            if (!sources || sources.length < 2 || sources.length > batch.mesh.instanceMatrix.count
                || batch.factory !== getInstancedMaterialFactory(sources[0].mesh.material)) {
                batch.dispose(); this.hits.delete(batch.mesh); this.batches.delete(key);
            } else if (sources.length !== batch.sources.length || sources.some((source, i) => source !== batch.sources[i])) {
                batch.setSources([]);
            }
        }
        for (const [key, sources] of groups) {
            if (sources.length < 2) continue;
            let batch = this.batches.get(key);
            if (!batch) {
                batch = new MeshInstanceBatch(sources);
                this.batches.set(key, batch); this.hits.set(batch.mesh, batch);
                this.root.add(batch.mesh);
            }
            if (!batch.sources.length) batch.setSources(sources);
        }
    }
    handleClick = (event: ThreeEvent<MouseEvent>) => {
        if (event.delta > 4 || event.instanceId == null) return;
        this.hits.get(event.object)?.sources[event.instanceId]?.onClick?.(event);
    };
}
