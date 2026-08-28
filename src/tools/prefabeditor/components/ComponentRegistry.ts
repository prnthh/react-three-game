import type { FC } from "react";
import type { GameObject } from "../types";

export type AssetRef = { type: "model" | "texture" | "sound"; path: string };

export function assetRef(
	type: AssetRef["type"],
	path: unknown,
): AssetRef | null {
	return typeof path === "string" ? { type, path } : null;
}

export function assetRefs(
	...refs: Array<AssetRef | null | undefined>
): AssetRef[] {
	return refs.filter((ref): ref is AssetRef => ref != null);
}

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

type NumberPropertyDefinition<T> = {
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

type SelectPropertyDefinition<T> = {
	type: "select";
	default: ComponentPropertyDefault<T>;
	options: readonly ComponentPropertyOption<Extract<NonNullable<T>, string>>[];
};

type TypedPropertyDefinition<T> = {
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
	/** Render beside children so R3F can attach this object to the enclosing component. */
	attachment?: boolean;
	/** Set when this component occupies a single slot on a node. Use a string to share a slot across component types. */
	disableSiblingComposition?: boolean | string;
	Editor?: FC<ComponentEditorProps<P>>;
	/** Serializable property contract and the source of runtime/editor defaults. */
	properties: ComponentPropertyDefinitions<P>;
	View?: FC<ComponentViewProps<P>>;
	/** Declare which asset paths this component references (for asset loading). */
	getAssetRefs?: (properties: P) => AssetRef[];
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

export function getSiblingCompositionSlot(componentName: string, disableSiblingComposition: boolean | string | undefined) {
	if (!disableSiblingComposition) return null;
	return typeof disableSiblingComposition === "string" ? disableSiblingComposition : componentName;
}

export function canAddComponentToNode(node: GameObject, component: Component<any> | undefined, allComponents = REGISTRY) {
	if (!component) return false;

	const slot = getSiblingCompositionSlot(component.name, component.disableSiblingComposition);
	if (!slot) return true;

	return !Object.values(node.components ?? {}).some(entry => {
		if (!entry?.type) return false;
		const sibling = allComponents[entry.type];
		return getSiblingCompositionSlot(entry.type, sibling?.disableSiblingComposition) === slot;
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

export function getComponentAssetRefs(
	componentType: string,
	properties: Record<string, unknown>,
): AssetRef[] {
	const component = REGISTRY[componentType];
	return component?.getAssetRefs?.(properties) ?? [];
}
