import { GameObject, Prefab } from "./types";
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Object3D } from 'three';

export interface ExportGLBOptions {
    filename?: string;
    binary?: boolean;
    onComplete?: (result: ArrayBuffer | object) => void;
    onError?: (error: any) => void;
}

/** Save a prefab as JSON file */
export function saveJson(data: Prefab, filename: string) {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
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
        name: `${node.name ?? "Node"} Copy`,
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
