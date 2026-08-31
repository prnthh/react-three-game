import type { FC } from "react";
import type { GameObject } from "../types";

/** Props every component View receives from the renderer. */
export interface ComponentViewProps<P = Record<string, unknown>> {
	/** This component's own data from the prefab JSON. */
	properties: P;
	/** False while the node is disabled; render-graph components may still prepare resources. */
	enabled: boolean;
	/** Children to render for components that wrap the current subtree. */
	children?: React.ReactNode;
}

export type { NodeInteractionHandlers } from "../usePointerEvents";

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

type ComponentPropertyEditor = {
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

export interface Component<P extends object = Record<string, any>> {
	name: string;
	/** Keep this render-graph component mounted for preparation while its node is disabled. */
	renderWhenDisabled?: boolean;
	/** Request the node's composed world position in the runtime node scope. */
	usesWorldPosition?: boolean;
	/** Render beside children so R3F can attach this object to the enclosing component. */
	attachment?: boolean;
	/** R3F-style attachment target. Components with the same target are mutually exclusive on a node. */
	attach?: string;
	Editor?: FC<ComponentEditorProps<P>>;
	/** Serializable property contract and the source of runtime/editor defaults. */
	properties: ComponentPropertyDefinitions<P>;
	View?: FC<ComponentViewProps<P>>;
}

const REGISTRY: Record<string, Component<any>> = {};

export function registerComponent(component: Component<any>) {
	REGISTRY[component.name] = component;
}

export function getComponentDef(name: string): Component<any> | undefined {
	return REGISTRY[name];
}

export function getAllComponentDefs(): Record<string, Component<any>> {
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
	const attach = component.attach;
	if (!attach) return true;

	return !Object.values(node.components ?? {}).some(entry => {
		if (!entry?.type) return false;
		return allComponents[entry.type]?.attach === attach;
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
