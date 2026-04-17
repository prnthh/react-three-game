import type { Object3D } from "three";
import type { ComponentData, GameObject, Prefab } from "./types";
import { findComponentEntry } from "./types";
import { createComponentData, createNode as createPrefabNode } from "./prefab";

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
	readonly name: string | undefined;
	readonly enabled: boolean;
	readonly parent: Entity | null;
	readonly children: Entity[];
	readonly object: Object3D | null;
	readonly rigidBody: any;
	set: (data: EntityData) => void;
	update: (update: (node: EntityData) => EntityData) => void;
	getComponent: <TProperties = Record<string, any>>(name: string) => EntityComponent<TProperties> | null;
	addComponent: (type: string, properties?: Record<string, any>) => EntityComponent | null;
	removeComponent: (name: string) => void;
	destroy: () => void;
}

export type EntityUpdate = (node: EntityData) => EntityData;
export type SceneUpdates = Record<string, EntityUpdate>;

export interface Scene {
	readonly rootId: string;
	find: (id: string) => Entity | null;
	get: (id: string) => Entity;
	create: (name: string, components?: Record<string, { type: string; properties?: Record<string, any> }>, options?: SpawnOptions) => Entity;
	update: {
		(id: string, update: EntityUpdate): void;
		(updates: SceneUpdates): void;
	};
	add: (node: GameObject, options?: SpawnOptions) => Entity;
	remove: (id: string) => void;
	/**
	 * Coalesce many entity / component updates into a single store revision.
	 * Entity `update`/`set`, `EntityComponent` `set`/`update`, `addComponent`,
	 * and `removeComponent` calls inside the callback are buffered and flushed
	 * as one batched write. `add`, `remove`, and `destroy` (structural tree ops)
	 * still commit immediately.
	 */
	batch: (fn: () => void) => void;
}

interface SceneAdapter {
	getRootId: () => string;
	getNode: (id: string) => EntityData | null;
	getChildIds: (id: string) => string[];
	getParentId: (id: string) => string | null;
	updateNode: (id: string, update: (node: EntityData) => EntityData) => void;
	updateNodes: (updates: Record<string, (node: EntityData) => EntityData>) => void;
	addNode: (node: GameObject, options?: SpawnOptions) => string;
	removeNode: (id: string) => void;
	getObject?: (id: string) => Object3D | null;
	getRigidBody?: (id: string) => any;
}

function missingNode(id: string): never {
	throw new Error(`Scene node not found: ${id}`);
}

function normalizePath(path?: PropertyPath): Array<string | number> {
	if (!path) return [];
	return Array.isArray(path) ? path : path.split(".").filter(Boolean);
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

export function createScene(adapter: SceneAdapter): Scene {
	let batchBuffer: Map<string, EntityUpdate> | null = null;

	function routeUpdate(id: string, update: EntityUpdate) {
		if (batchBuffer) {
			const prev = batchBuffer.get(id);
			batchBuffer.set(id, prev ? (node) => update(prev(node)) : update);
			return;
		}
		adapter.updateNode(id, update);
	}

	function routeUpdates(updates: SceneUpdates) {
		if (batchBuffer) {
			for (const id in updates) routeUpdate(id, updates[id]);
			return;
		}
		adapter.updateNodes(updates);
	}

	function batch(fn: () => void) {
		if (batchBuffer) { fn(); return; }
		batchBuffer = new Map();
		try {
			fn();
			if (batchBuffer.size > 0) {
				const updates: SceneUpdates = {};
				for (const [id, update] of batchBuffer) updates[id] = update;
				adapter.updateNodes(updates);
			}
		} finally {
			batchBuffer = null;
		}
	}

	const getNode = (id: string) => {
		if (!adapter.getNode(id)) missingNode(id);
		return createNode(id);
	};

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
				routeUpdate(entityId, node => {
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
				routeUpdate(entityId, node => {
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
			get name() {
				return adapter.getNode(id)?.name;
			},
			get enabled() {
				return !adapter.getNode(id)?.disabled;
			},
			get parent() {
				const parentId = adapter.getParentId(id);
				return parentId ? createNode(parentId) : null;
			},
			get children() {
				return adapter.getChildIds(id).map(createNode);
			},
			get object() {
				return adapter.getObject?.(id) ?? null;
			},
			get rigidBody() {
				return adapter.getRigidBody?.(id) ?? null;
			},
			set(data) {
				routeUpdate(id, () => data);
			},
			update(update) {
				routeUpdate(id, update);
			},
			getComponent(name) {
				const node = adapter.getNode(id);
				if (!node) return null;

				const entry = findComponentEntry(node, name);
				if (!entry) return null;

				const [componentKey, component] = entry;
				return createComponent(id, componentKey, component.type);
			},
			addComponent(type, properties) {
				const key = type.toLowerCase();
				routeUpdate(id, node => ({
					...node,
					components: {
						...node.components,
						[key]: createComponentData(type, properties),
					},
				}));
				return createComponent(id, key, type);
			},
			removeComponent(name) {
				routeUpdate(id, node => {
					const entry = findComponentEntry(node, name);
					if (!entry) return node;
					const [key] = entry;
					const { [key]: _, ...rest } = node.components ?? {};
					return { ...node, components: rest };
				});
			},
			destroy() {
				adapter.removeNode(id);
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

			routeUpdate(idOrUpdates, mutate);
			return;
		}

		if (Object.keys(idOrUpdates).length === 0) {
			return;
		}

		routeUpdates(idOrUpdates);
	}

	return {
		get rootId() {
			return adapter.getRootId();
		},
		find(id: string) {
			return adapter.getNode(id) ? createNode(id) : null;
		},
		get: getNode,
		create(name, components, options) {
			const node = createPrefabNode(name, components);
			return createNode(adapter.addNode(node, options));
		},
		update,
		add(node, options) {
			return createNode(adapter.addNode(node, options));
		},
		remove(id) {
			adapter.removeNode(id);
		},
		batch,
	};
}