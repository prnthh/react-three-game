import { parseCollisionName } from '../../core/collision.js';
import { Mesh, type Object3D } from 'three';
import { decomposeModelToPrefabNodes, type DecomposeModelOptions } from '../../core/modelPrefab.js';

/** Optional editor importer for Blender _col and _colonly meshes. */
export function importCollisionModel(model: Object3D, options: DecomposeModelOptions = {}) {
    const collisions = new Map<Object3D, NonNullable<ReturnType<typeof parseCollisionName>>>();
    model.traverse(object => {
        const match = parseCollisionName(object.name);
        if (object instanceof Mesh && match) collisions.set(object, match);
    });
    if (!collisions.size) return null;
    return decomposeModelToPrefabNodes(model, {
        ...options,
        collisionNames: false,
        includeInvisible: true,
        mapNode(node, object) {
            const match = collisions.get(object);
            if (!match) return node;
            return {
                ...node,
                name: match.name,
                hidden: false,
                components: {
                    ...node.components,
                    geometry: {
                        type: 'BufferGeometry', properties: {
                            ...node.components?.geometry?.properties,
                            visible: match.visible,
                        }
                    },
                    physics: { type: 'CrashcatPhysics', properties: { type: 'fixed', colliders: match.shape === 'convex' ? 'hull' : 'trimesh', sensor: false } },
                },
            };
        },
    });
}
