import { Mesh, type Object3D } from 'three';
import { decomposeModelToPrefabNodes, type DecomposeModelOptions } from '../../tools/prefabeditor/modelPrefab';

/** Optional editor importer for Blender _col and _colonly meshes. */
export function importCollisionModel(model: Object3D, options: DecomposeModelOptions = {}) {
    const collisions = new Map<Object3D, RegExpMatchArray>();
    model.traverse(object => {
        const match = object.name.match(/^(.*)_(colonly|col)(?:\.\d+)?$/i);
        if (object instanceof Mesh && match) collisions.set(object, match);
    });
    if (!collisions.size) return null;
    return decomposeModelToPrefabNodes(model, {
        ...options,
        includeInvisible: true,
        mapNode(node, object) {
            const match = collisions.get(object);
            if (!match) return node;
            return {
                ...node,
                name: match[1] || object.name,
                hidden: false,
                components: {
                    ...node.components,
                    mesh: {
                        type: 'Mesh', properties: {
                            ...node.components?.mesh?.properties,
                            visible: match[2].toLowerCase() === 'col',
                        }
                    },
                    physics: { type: 'CrashcatPhysics', properties: { type: 'fixed', colliders: 'trimesh', sensor: false } },
                },
            };
        },
    });
}
