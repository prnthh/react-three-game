import type { Matrix4 } from 'three';
import { compactPrefabMaterial } from '../../core/prefab.js';
import { findComponent, type GameObject, type MaterialComponentProperties, type PrefabMaterial } from '../../core/types.js';
import { resolvePrimitive, type GeometryProperties } from '../components/GeometryComponent.js';

export interface StaticPrimitiveBatch {
    geometry: GeometryProperties;
    material: MaterialComponentProperties;
    matrices: Float32Array | Float64Array;
    name?: string;
}

const primitiveComponents = new Set(['Transform', 'Geometry', 'Material']);

export function batchStaticPrimitives(root: GameObject, candidates: ReadonlyMap<GameObject, Matrix4>,
    palette: ReadonlyMap<string, PrefabMaterial>): StaticPrimitiveBatch[] {
    const groups = new Map<string, Omit<StaticPrimitiveBatch, 'matrices'> & { instances: { node: GameObject; matrix: Matrix4 }[] }>();
    for (const [node, matrix] of candidates) {
        if (node.children?.length) continue;
        const geometry = findComponent(node, 'Geometry')?.properties as GeometryProperties | undefined;
        const material = findComponent(node, 'Material')?.properties as MaterialComponentProperties | undefined;
        if (!geometry || !material || geometry.instanced === false || geometry.emitClickEvent ||
            (material.attach ?? 'material') !== 'material' || !(matrix.determinant() > 0)) continue;
        const components = Object.values(node.components ?? {});
        if (components.some(component => !component || !primitiveComponents.has(component.type)) ||
            new Set(components.map(component => component?.type)).size !== components.length) continue;
        const surface = material.name ? palette.get(material.name) : material;
        if (!surface || surface.materialType === 'sprite' || surface.transparent || (surface.transmission ?? 0) > 0) continue;
        const { type, args } = resolvePrimitive(geometry);
        const key = JSON.stringify([
            type, args, geometry.castShadow !== false, geometry.receiveShadow !== false, geometry.frustumCulled !== false,
            material.name || Object.entries(compactPrefabMaterial(surface)).sort(([left], [right]) => left.localeCompare(right)),
        ]);
        let group = groups.get(key);
        if (!group) {
            group = { geometry: { ...geometry, geometryType: type, args }, material, instances: [] };
            groups.set(key, group);
        }
        group.instances.push({ node, matrix });
    }
    const batches: StaticPrimitiveBatch[] = [];
    const removed = new Set<GameObject>();
    for (const { geometry, material, instances } of groups.values()) {
        // Ordinary meshes keep their CPU transform precision until Three makes
        // it camera-relative. Only instanced draws upload a float32 matrix buffer.
        const matrices = instances.length === 1 ? new Float64Array(16) : new Float32Array(instances.length * 16);
        instances.forEach(({ node, matrix }, index) => {
            matrices.set(matrix.elements, index * 16);
            removed.add(node);
        });
        batches.push({ geometry, material, matrices, name: instances.length === 1 ? instances[0].node.name?.trim() : undefined });
    }
    if (batches.length) {
        const prune = (node: GameObject): boolean => {
            if (removed.has(node)) return false;
            if (!node.children?.length) return true;
            node.children = node.children.filter(prune);
            return node.children.length > 0 || Object.values(node.components ?? {}).some(component => component?.type !== 'Transform');
        };
        prune(root);
    }
    return batches;
}
