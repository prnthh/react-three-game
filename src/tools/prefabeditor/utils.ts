import { GameObject, Prefab } from "./types";
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Box3, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';

export interface ExportGLBOptions {
    filename?: string;
    binary?: boolean;
    onComplete?: (result: ArrayBuffer | object) => void;
    onError?: (error: any) => void;
}

/** Save a prefab as JSON file, showing a Save As dialog when supported */
export async function saveJson(data: Prefab, filename: string) {
    const json = JSON.stringify(data, null, 2);
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: `${filename || 'prefab'}.json`,
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();
            return;
        } catch (e: any) {
            if (e?.name === 'AbortError') return; // user cancelled
        }
    }
    // Fallback for browsers without File System Access API
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(json);
    a.download = `${filename || 'prefab'}.json`;
    a.click();
}

/** Load a prefab from JSON file */
export function loadJson(): Promise<Prefab | undefined> {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = e => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return resolve(undefined);
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const text = e.target?.result;
                    if (typeof text === 'string') resolve(JSON.parse(text) as Prefab);
                } catch (err) {
                    console.error('Error parsing prefab JSON:', err);
                    resolve(undefined);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

/**
 * Export a Three.js scene or object to GLB format
 * @param sceneRoot - The Three.js Object3D to export
 * @param options - Export options
 * @returns Promise that resolves when export is complete
 */
export function exportGLB(
    sceneRoot: Object3D,
    options: ExportGLBOptions = {}
): Promise<ArrayBuffer | object> {
    const {
        filename = 'scene.glb',
        binary = true,
        onComplete,
        onError
    } = options;

    return new Promise((resolve, reject) => {
        const exporter = new GLTFExporter();

        exporter.parse(
            sceneRoot,
            (result) => {
                onComplete?.(result);
                resolve(result);

                // Trigger download if filename is provided
                if (filename) {
                    const blob = new Blob(
                        [result as ArrayBuffer],
                        { type: binary ? 'application/octet-stream' : 'application/json' }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            },
            (error) => {
                console.error('Error exporting GLB:', error);
                onError?.(error);
                reject(error);
            },
            { binary }
        );
    });
}

/**
 * Export a Three.js scene to GLB and return the ArrayBuffer without downloading
 * @param sceneRoot - The Three.js Object3D to export
 * @returns Promise that resolves with the GLB data as ArrayBuffer
 */
export async function exportGLBData(sceneRoot: Object3D): Promise<ArrayBuffer> {
    const result = await exportGLB(sceneRoot, { filename: '', binary: true });
    return result as ArrayBuffer;
}

export function focusCameraOnObject(
    object: Object3D,
    camera: Object3D,
    target: Vector3,
    update?: () => void,
) {
    const bounds = new Box3().setFromObject(object);
    const center = new Vector3();
    const size = new Vector3();
    const quaternion = new Quaternion();
    object.getWorldQuaternion(quaternion);

    if (bounds.isEmpty()) {
        object.getWorldPosition(center);
        size.setScalar(1);
    } else {
        bounds.getCenter(center);
        bounds.getSize(size);
    }

    const radius = Math.max(size.length() * 0.5, 1);
    const forward = new Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
    const worldUp = new Vector3(0, 1, 0);
    const elevatedDirection = forward.clone().addScaledVector(worldUp, 0.65).normalize();
    const distance = camera instanceof PerspectiveCamera
        ? Math.max(radius / Math.tan((camera.fov * Math.PI) / 360) * 1.8, radius * 3.5)
        : radius * 4.5;
    const nextPosition = center.clone().add(elevatedDirection.multiplyScalar(distance));

    camera.position.copy(nextPosition);
    camera.lookAt(center);
    target.copy(center);
    update?.();
}

/** Find a node by ID in the tree */
export function findNode(root: GameObject, id: string): GameObject | null {
    if (root.id === id) return root;
    for (const child of root.children ?? []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
}

/** Find the parent of a node by ID */
export function findParent(root: GameObject, id: string): GameObject | null {
    for (const child of root.children ?? []) {
        if (child.id === id) return root;
        const found = findParent(child, id);
        if (found) return found;
    }
    return null;
}

/** Find all nodes matching a predicate */
export function findAll(root: GameObject, predicate: (node: GameObject) => boolean): GameObject[] {
    const results: GameObject[] = [];
    if (predicate(root)) results.push(root);
    for (const child of root.children ?? []) {
        results.push(...findAll(child, predicate));
    }
    return results;
}

/** Find all nodes that have a specific component type */
export function findByComponent(root: GameObject, componentType: string): GameObject[] {
    return findAll(root, node => 
        Object.values(node.components ?? {}).some(c => c?.type === componentType)
    );
}

/** Get a flattened list of all nodes */
export function flatten(root: GameObject): GameObject[] {
    return findAll(root, () => true);
}

/** Immutably update a node by ID */
export function updateNode(root: GameObject, id: string, update: (node: GameObject) => GameObject): GameObject {
    if (root.id === id) return update(root);
    if (!root.children) return root;
    return {
        ...root,
        children: root.children.map(child => updateNode(child, id, update))
    };
}

/** Immutably insert a node under a parent ID, defaulting to the root when the parent is missing */
export function insertNode(root: GameObject, node: GameObject, parentId?: string): GameObject {
    if (!parentId || parentId === root.id) {
        return {
            ...root,
            children: [...(root.children ?? []), node]
        };
    }

    const nextRoot = updateNode(root, parentId, parent => ({
        ...parent,
        children: [...(parent.children ?? []), node]
    }));

    if (nextRoot === root) {
        return {
            ...root,
            children: [...(root.children ?? []), node]
        };
    }

    return nextRoot;
}

/** Immutably delete a node by ID */
export function deleteNode(root: GameObject, id: string): GameObject | null {
    if (root.id === id) return null;
    if (!root.children) return root;
    return {
        ...root,
        children: root.children
            .map(child => deleteNode(child, id))
            .filter((child): child is GameObject => child !== null)
    };
}

/** Deep clone a node with new IDs */
export function cloneNode(node: GameObject): GameObject {
    return {
        ...node,
        id: crypto.randomUUID(),
        name: `${node.name ?? node.id} Copy`,
        children: node.children?.map(cloneNode)
    };
}

/** Recursively update all IDs in a node tree */
export function regenerateIds(node: GameObject): GameObject {
    return {
        ...node,
        id: crypto.randomUUID(),
        children: node.children?.map(regenerateIds)
    };
}

/** Get component data from a node */
export function getComponent<T = any>(node: GameObject, type: string): T | undefined {
    const comp = Object.values(node.components ?? {}).find(c => c?.type === type);
    return comp?.properties as T | undefined;
}

export function updateNodeById(
  root: GameObject,
  id: string,
  updater: (node: GameObject) => GameObject
): GameObject {
  if (root.id === id) {
    return updater(root);
  }

  if (!root.children) {
    return root;
  }

  let didChange = false;

  const newChildren = root.children.map(child => {
    const updated = updateNodeById(child, id, updater);
    if (updated !== child) didChange = true;
    return updated;
  });

  if (!didChange) return root;

  return {
    ...root,
    children: newChildren
  };
}

/** Create a GameObject node for a 3D model file */
export function createModelNode(filename: string, name?: string): GameObject {
    return {
        id: crypto.randomUUID(),
        name: name ?? filename.replace(/^.*[\/]/, '').replace(/\.[^.]+$/, ''),
        components: {
            transform: {
                type: 'Transform',
                properties: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
            },
            model: {
                type: 'Model',
                properties: { filename, instanced: false }
            }
        }
    };
}

/** Create a GameObject node for an image as a textured plane */
export function createImageNode(texturePath: string, name?: string): GameObject {
    return {
        id: crypto.randomUUID(),
        name: name ?? texturePath.replace(/^.*[\/]/, '').replace(/\.[^.]+$/, ''),
        components: {
            transform: {
                type: 'Transform',
                properties: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
            },
            geometry: {
                type: 'Geometry',
                properties: { geometryType: 'plane', args: [1, 1] }
            },
            material: {
                type: 'Material',
                properties: { color: '#ffffff', texture: texturePath }
            }
        }
    };
}
