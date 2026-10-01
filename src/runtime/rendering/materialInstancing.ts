import type { Material } from 'three';
import type { Node } from 'three/webgpu';

export type InstancedMaterialFactory = (inverseInstanceMatrix: Node<'mat4'>) => Material;
const factories = new WeakMap<Material, InstancedMaterialFactory>();

/** Runtime-only metadata: never serialized or copied through material.userData. */
export function registerInstancedMaterial(material: Material, factory: InstancedMaterialFactory) {
    factories.set(material, factory);
}
export function getInstancedMaterialFactory(material: Material | Material[]) {
    return Array.isArray(material) ? undefined : factories.get(material);
}
