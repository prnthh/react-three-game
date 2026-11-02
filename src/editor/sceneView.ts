import { Matrix4, Quaternion, Vector3 } from 'three';
import { composeTransform } from '../core/transforms.js';
import { findComponent, type GameObject, type Prefab } from '../core/types.js';

/** Initialize the authoring viewport from the first enabled authored perspective
 * camera. This does not activate scripts or require external prefab loading. */
export function getPrefabEditorView(prefab: Prefab) {
    type View = { position: [number, number, number]; target: [number, number, number]; fov: number; near: number; far: number };
    const visit = (node: GameObject, parent: Matrix4): View | undefined => {
        if (node.disabled) return;
        const transform = findComponent(node, 'Transform')?.properties;
        const world = parent.clone().multiply(composeTransform(transform?.position, transform?.rotation, transform?.scale));
        const camera = findComponent(node, 'Camera')?.properties;
        if (camera && camera.projection !== 'orthographic') {
            const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
            world.decompose(position, rotation, scale);
            const target = new Vector3(0, 0, -Math.max(1, camera.focus ?? 10)).applyQuaternion(rotation).add(position);
            return { position: position.toArray(), target: target.toArray(), fov: camera.fov ?? 50, near: camera.near ?? 0.1, far: camera.far ?? 1000 };
        }
        for (const child of node.children ?? []) { const view = visit(child, world); if (view) return view; }
    };
    return visit(prefab.root, new Matrix4());
}
