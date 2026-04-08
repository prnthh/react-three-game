import type { ComponentData, GameObject, Prefab } from "./types";

export interface SpawnOptions {
    name?: string;
    parentId?: string;
    select?: boolean;
}

export type EntityData = Omit<GameObject, "children">;
export type PropertyPath = string | Array<string | number>;

export interface EntityComponent<TProperties = Record<string, any>> {
    readonly key: string;
    readonly type: string;
    get: <TValue = unknown>(path?: PropertyPath) => TValue | undefined;
    set: (path: PropertyPath, value: unknown) => void;
    update: (update: (properties: TProperties) => TProperties) => void;
}

export interface Entity {
    readonly id: string;
    set: (data: EntityData) => void;
    update: (update: (node: EntityData) => EntityData) => void;
    getComponent: <TProperties = Record<string, any>>(name: string) => EntityComponent<TProperties> | null;
}

export type EntityUpdate = (node: EntityData) => EntityData;
export type SceneUpdates = Record<string, EntityUpdate>;

export interface Scene {
    readonly rootId: string;
    find: (id: string) => Entity | null;
    get: (id: string) => Entity;
    update: {
        (id: string, update: EntityUpdate): void;
        (updates: SceneUpdates): void;
    };
    add: (node: GameObject, options?: SpawnOptions) => Entity;
    remove: (id: string) => void;
}

interface SceneAdapter {
    getRootId: () => string;
    getNode: (id: string) => EntityData | null;
    updateNode: (id: string, update: (node: EntityData) => EntityData) => void;
    updateNodes: (updates: Record<string, (node: EntityData) => EntityData>) => void;
    addNode: (node: GameObject, options?: SpawnOptions) => string;
    removeNode: (id: string) => void;
}

function missingNode(id: string): never {
    throw new Error(`Scene node not found: ${id}`);
}

function normalizePath(path?: PropertyPath): Array<string | number> {
    if (path === undefined) {
        return [];
    }

    if (Array.isArray(path)) {
        return path;
    }

    return path.split(".").filter(Boolean);
}

function getValueAtPath(value: unknown, path?: PropertyPath): unknown {
    const segments = normalizePath(path);
    let current = value;

    for (const segment of segments) {
        if (current == null || typeof current !== "object") {
            return undefined;
        }

        current = (current as Record<string | number, unknown>)[segment];
    }

    return current;
}

function setValueAtPath<T>(value: T, path: PropertyPath, nextValue: unknown): T {
    const segments = normalizePath(path);

    if (segments.length === 0) {
        return nextValue as T;
    }

    const cloneBranch = (current: unknown, index: number): unknown => {
        const segment = segments[index];
        const source = current == null ? undefined : current;
        const container = Array.isArray(source)
            ? [...source]
            : source && typeof source === "object"
                ? { ...(source as Record<string | number, unknown>) }
                : typeof segment === "number"
                    ? []
                    : {};

        if (index === segments.length - 1) {
            (container as Record<string | number, unknown>)[segment] = nextValue;
            return container;
        }

        const child = source && typeof source === "object"
            ? (source as Record<string | number, unknown>)[segment]
            : undefined;

        (container as Record<string | number, unknown>)[segment] = cloneBranch(child, index + 1);
        return container;
    };

    return cloneBranch(value, 0) as T;
}

function findComponentEntry(node: EntityData, name: string): [string, ComponentData] | null {
    if (!node.components) {
        return null;
    }

    const direct = node.components[name];
    if (direct) {
        return [name, direct];
    }

    const normalizedName = name.toLowerCase();
    for (const [key, component] of Object.entries(node.components)) {
        if (!component) {
            continue;
        }

        if (key.toLowerCase() === normalizedName || component.type.toLowerCase() === normalizedName) {
            return [key, component];
        }
    }

    return null;
}

export function createScene(adapter: SceneAdapter): Scene {
    const findNode = (id: string) => adapter.getNode(id) ? createNode(id) : null;

    const getNode = (id: string) => findNode(id) ?? missingNode(id);

    function createComponent<TProperties = Record<string, any>>(
        entityId: string,
        componentKey: string,
        componentType: string,
    ): EntityComponent<TProperties> {
        return {
            key: componentKey,
            type: componentType,
            get<TValue = unknown>(path?: PropertyPath): TValue | undefined {
                const node = adapter.getNode(entityId);
                const component = node?.components?.[componentKey];

                if (!component) {
                    return undefined;
                }

                return getValueAtPath(component.properties, path) as TValue | undefined;
            },
            set(path, value) {
                adapter.updateNode(entityId, node => {
                    const component = node.components?.[componentKey];
                    if (!component) {
                        return node;
                    }

                    return {
                        ...node,
                        components: {
                            ...node.components,
                            [componentKey]: {
                                ...component,
                                properties: setValueAtPath(component.properties, path, value),
                            },
                        },
                    };
                });
            },
            update(update) {
                adapter.updateNode(entityId, node => {
                    const component = node.components?.[componentKey];
                    if (!component) {
                        return node;
                    }

                    const nextProperties = update(component.properties as TProperties);
                    if (nextProperties === component.properties) {
                        return node;
                    }

                    return {
                        ...node,
                        components: {
                            ...node.components,
                            [componentKey]: {
                                ...component,
                                properties: nextProperties as Record<string, any>,
                            },
                        },
                    };
                });
            },
        };
    }

    function createNode(id: string): Entity {
        return {
            id,
            set(data) {
                adapter.updateNode(id, () => data);
            },
            update(update) {
                adapter.updateNode(id, update);
            },
            getComponent(name) {
                const node = adapter.getNode(id);
                if (!node) {
                    return null;
                }

                const entry = findComponentEntry(node, name);
                if (!entry) {
                    return null;
                }

                const [componentKey, component] = entry;
                return createComponent(id, componentKey, component.type);
            },
        };
    }

    function update(id: string, mutate: EntityUpdate): void;
    function update(updates: SceneUpdates): void;
    function update(idOrUpdates: string | SceneUpdates, mutate?: EntityUpdate) {
        if (typeof idOrUpdates === "string") {
            if (!mutate) {
                return;
            }

            adapter.updateNode(idOrUpdates, mutate);
            return;
        }

        if (Object.keys(idOrUpdates).length === 0) {
            return;
        }

        adapter.updateNodes(idOrUpdates);
    }

    return {
        get rootId() {
            return adapter.getRootId();
        },
        find: findNode,
        get: getNode,
        update,
        add(node, options) {
            return createNode(adapter.addNode(node, options));
        },
        remove(id) {
            adapter.removeNode(id);
        },
    };
}