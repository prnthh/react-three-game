export interface Prefab {
    id?: string;
    name?: string;
    root: GameObject;
}

export interface GameObject {
    id: string;
    name?: string;
    disabled?: boolean;
    locked?: boolean;
    children?: GameObject[];
    components?: {
        [key: string]: ComponentData | undefined;
    };
}

export interface ComponentData {
    type: string;
    properties: Record<string, any>;
}

type ComponentHost = { components?: Record<string, { type?: string; properties?: Record<string, any> } | undefined> };

/** Find a component on a node by type name or key (e.g. "Model", "transform"). */
export function findComponent(node: ComponentHost | null | undefined, name: string): ComponentData | undefined {
    return findComponentEntry(node, name)?.[1];
}

/** Find a component entry [key, data] by type name or key — use when you need the key for mutations. */
export function findComponentEntry(node: ComponentHost | null | undefined, name: string): [string, ComponentData] | undefined {
    if (!node?.components) return undefined;
    // Direct key match
    const direct = node.components[name];
    if (direct?.type) return [name, direct as ComponentData];
    // Case-insensitive key + type scan
    const normalized = name.toLowerCase();
    for (const [key, comp] of Object.entries(node.components)) {
        if (!comp?.type) continue;
        if (key.toLowerCase() === normalized || comp.type.toLowerCase() === normalized) {
            return [key, comp as ComponentData];
        }
    }
    return undefined;
}

/** Check if a node has a component of the given type. */
export function hasComponent(node: ComponentHost | null | undefined, typeName: string): boolean {
    return findComponentEntry(node, typeName) !== undefined;
}
