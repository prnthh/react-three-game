import type { ComponentDependency } from "./dependencies.js";
import type { BufferGeometry } from "three";
import type { FC } from "react";
import type { GameObject } from "./types.js";

/** Props every component View receives from the renderer. */
export interface ComponentViewProps<P = Record<string, unknown>> {
	/** This component's properties with schema defaults resolved. */
	properties: IsAny<P> extends true ? P : Required<P>;
	/** False while disabled or preparing; Views that opt into staying mounted must gate behavior with this value. */
	enabled: boolean;
	/** Children to render for components that wrap the current subtree. */
	children?: React.ReactNode;
}

export type { NodeInteractionHandlers } from "./nodeInteractions.js";

export interface ComponentEditorProps<P extends object = Record<string, any>> {
	node: GameObject;
	/** Properties with schema defaults resolved, as in the runtime View. */
	properties: IsAny<P> extends true ? P : Required<P>;
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

export interface ComponentRendering<P extends object> {
    /** Render composition only. Coexistence is declared separately with exclusive. */
    slot?: 'object' | 'geometry' | 'material';
    /** Keep visual resources mounted while disabled. Use useComponentActive(enabled) to gate behavior. */
    renderWhenDisabled?: boolean;
    /** Wrap node contents; return children to preserve subsequent components and child nodes. */
    View?: FC<ComponentViewProps<P>>;
}

export interface ComponentGeometryModifier<P extends object> {
    /** Pure node-local Geometry modifier. Return a new owned geometry; never mutate source. */
    modifyGeometry?: (source: BufferGeometry, properties: P, context?: { scale: readonly [number, number, number] }) => BufferGeometry;
}

export interface Component<P extends object = Record<string, any>> extends ComponentRendering<P>, ComponentGeometryModifier<P> {
    name: string;
    /** Scene components configure only the outer document root, outside the node tree. */
    scope?: 'scene';
    /** Editor grouping only; defaults to Misc. */
    category?: ComponentCategory;
    description?: string;
    /** At most one component with this group on a node. Opt in only for a shared node-local resource or ownership conflict; not for scene-wide state. */
    exclusive?: string;
    /** Declare resources without mounting a view; paths are relative to the prefab basePath. */
    dependencies?: (properties: P) => readonly ComponentDependency[];
    /** Serializable property contract and source of runtime/editor defaults. */
    properties: ComponentPropertyDefinitions<P>;
}

const REGISTRY: Record<string, Component<any>> = {};
let registryVersion = 0;
export const getComponentRegistryVersion = () => registryVersion;

export function registerComponent(component: Component<any>) {
    if (REGISTRY[component.name] === component) return;
    REGISTRY[component.name] = component;
    registryVersion += 1;
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
	// Undefined is an unset field, including patches made before JSON serialization.
	const authored = Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
	return { ...getComponentDefaultProperties(component, authored), ...authored } as P;
}

export function canAddComponentToNode(node: GameObject, component: Component<any> | undefined, allComponents = REGISTRY, rootId?: string) {
	if (!component || component.scope === 'scene' && node.id !== rootId) return false;
	const group = component.exclusive;
	if (!group) return true;

	return !Object.values(node.components ?? {}).some(entry => {
		if (!entry?.type) return false;
		return allComponents[entry.type]?.exclusive === group;
	});
}

export function getNextComponentKey(node: GameObject, componentName: string) {
	const baseKey = componentName.toLowerCase();
	let nextKey = baseKey;
	let index = 1;

	while (Object.hasOwn(node.components ?? {}, nextKey)) {
		nextKey = `${baseKey}_${index}`;
		index += 1;
	}

	return nextKey;
}
