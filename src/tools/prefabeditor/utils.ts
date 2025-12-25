import { GameObject } from "./types";

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
        children: node.children?.map(cloneNode)
    };
}

/** Get component data from a node */
export function getComponent<T = any>(node: GameObject, type: string): T | undefined {
    const comp = Object.values(node.components ?? {}).find(c => c?.type === type);
    return comp?.properties as T | undefined;
}
