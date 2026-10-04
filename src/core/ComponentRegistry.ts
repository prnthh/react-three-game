import type { ComponentDependency } from "./dependencies.js";
import type { BufferGeometry } from "three";
import type { FC } from "react";
import type { GameObject } from "./types.js";

/** Props every component View receives from the renderer. */
export interface ComponentViewProps<P = Record<string, unknown>> {
	/** This component's own data from the prefab JSON. */
	properties: IsAny<P> extends true ? P : Required<P>;
	/** False while the node is disabled; render-graph components may still prepare resources. */
	enabled: boolean;
	/** Children to render for components that wrap the current subtree. */
	children?: React.ReactNode;
}

export type { NodeInteractionHandlers } from "./nodeInteractions.js";

export interface ComponentEditorProps<P extends object = Record<string, any>> {
	node: GameObject;
	properties: P;
	update: (patch: Partial<P>) => void;
}

export type ComponentPropertyType =
	| "string"
	| "number"
	| "boolean"
	| "color"
	| "select"
	| "vector2"
	| "vector3"
	| "number[]"
	| "string[]"
	| "array"
	| "object";

type ComponentPropertyDefault<T> = T | ((properties: Record<string, any>) => T);

export type ComponentPropertySchema = Record<string, unknown>;

type ComponentPropertyEditor = {
    /** Agent-facing semantics, units, asset paths, etc. */
    description?: string;
    /** Optional nested/positional JSON Schema; evaluated against resolved properties. */
    schema?: ComponentPropertySchema | ((properties: Record<string, any>) => ComponentPropertySchema);
	/** Inspector label. Property names are humanized when omitted. */
	label?: string;
};

type NumberPropertyDefinition<T> = ComponentPropertyEditor & {
	type?: "number";
	default: ComponentPropertyDefault<T>;
	min?: number;
	max?: number;
	step?: number;
};

export type ComponentPropertyOption<T = string> = {
	value: T;
	label: string;
};

type SelectPropertyDefinition<T> = ComponentPropertyEditor & {
	type: "select";
	default: ComponentPropertyDefault<T>;
	options: readonly ComponentPropertyOption<Extract<NonNullable<T>, string>>[];
};

type TypedPropertyDefinition<T> = ComponentPropertyEditor & {
	type: Exclude<ComponentPropertyType, "number" | "select">;
	default: ComponentPropertyDefault<T>;
};

type IsAny<T> = 0 extends (1 & T) ? true : false;

export type ComponentPropertyDefinition<T = unknown> =
	IsAny<T> extends true
		? NumberPropertyDefinition<T> | SelectPropertyDefinition<T> | TypedPropertyDefinition<T>
		: [NonNullable<T>] extends [number]
		? NumberPropertyDefinition<T>
		: SelectPropertyDefinition<T> | TypedPropertyDefinition<T>;

export type ComponentPropertyDefinitions<P extends object> = {
	[Name in keyof Required<P>]: ComponentPropertyDefinition<P[Name]>;
};

export type ComponentCategory = 'mesh' | 'materials' | 'lighting' | 'camera' | 'audio' | 'transform' | 'physics' | 'misc';

export interface Component<P extends object = Record<string, any>> {
	name: string;
    /** Optional editor grouping; otherwise inferred from the render slot. */
    category?: ComponentCategory;
    description?: string;
	/** Declare resources without mounting a view; paths are relative to the prefab basePath. */
	dependencies?: (properties: P) => readonly ComponentDependency[];
	/** Keep this render-graph component mounted for preparation while its node is disabled. */
	renderWhenDisabled?: boolean;
	/** Optional node slot. Geometry gets an implicit mesh when no object view is present.
	 * Object views supply their own render object; materials attach inside it.
	 * Reuse helpers in code, never require a separate base Mesh component on the node. */
	slot?: 'object' | 'geometry' | 'material' | 'transform' | 'environment' | 'fog' | 'data';
	/** Serializable property contract and the source of runtime/editor defaults. */
	properties: ComponentPropertyDefinitions<P>;
	/** Pure node-local modifier consumed by Geometry; return a new owned geometry without mutating source. Applied in component order. */
	modifyGeometry?: (source: BufferGeometry, properties: P, context?: { scale: readonly [number, number, number] }) => BufferGeometry;
	View?: FC<ComponentViewProps<P>>;
}

const REGISTRY: Record<string, Component<any>> = {};
let registryVersion = 0;
const registryListeners = new Set<() => void>();
export const getComponentRegistryVersion = () => registryVersion;
export function subscribeComponentRegistry(listener: () => void) {
    registryListeners.add(listener);
    return () => { registryListeners.delete(listener); };
}

export function registerComponent(component: Component<any>) {
    if (REGISTRY[component.name] === component) return;
    REGISTRY[component.name] = component;
    registryVersion += 1;
    registryListeners.forEach(listener => listener());
}

/** @internal Install engine defaults without replacing runtime plugins. */
export function registerBuiltInComponents(components: readonly Component<any>[]) {
	components.forEach(component => {
		if (!REGISTRY[component.name]) registerComponent(component);
	});
}

export function getComponent(name: string): Component<any> | undefined {
	return REGISTRY[name];
}

export function getComponents(): Record<string, Component<any>> {
	return { ...REGISTRY };
}

export function getComponentDefaultProperties(
	component: Component<any> | undefined,
	properties: Record<string, any> = {},
): Record<string, any> {
	if (component) {
		return Object.entries(component.properties).reduce<Record<string, unknown>>((defaults, [name, definition]) => {
			const value = (definition as { default: ComponentPropertyDefault<unknown> }).default;
			defaults[name] = typeof value === "function"
				? value({ ...defaults, ...properties })
				: value;
			return defaults;
		}, {});
	}

	return {};
}

export function resolveComponentProperties<P extends object>(
	component: Component<P> | undefined,
	properties: P,
): P {
	return { ...getComponentDefaultProperties(component, properties), ...properties } as P;
}

export function canAddComponentToNode(node: GameObject, component: Component<any> | undefined, allComponents = REGISTRY) {
	if (!component) return false;
	const slot = component.slot;
	if (!slot) return true;

	return !Object.values(node.components ?? {}).some(entry => {
		if (!entry?.type) return false;
		return allComponents[entry.type]?.slot === slot;
	});
}

export function getNextComponentKey(node: GameObject, componentName: string) {
	const baseKey = componentName.toLowerCase();
	const existingKeys = new Set(Object.keys(node.components ?? {}));
	let nextKey = baseKey;
	let index = 1;

	while (existingKeys.has(nextKey)) {
		nextKey = `${baseKey}_${index}`;
		index += 1;
	}

	return nextKey;
}
