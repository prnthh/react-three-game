import type { FC } from "react";
import type { ComponentData, GameObject } from "../types";

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
	/** Children to render for components that wrap the current subtree. */
	children?: React.ReactNode;
	/** Current node local position for wrapper components. */
	position?: [number, number, number];
	/** Current node local rotation in radians for wrapper components. */
	rotation?: [number, number, number];
	/** Current node local scale for wrapper components. */
	scale?: [number, number, number];
}

export interface Component {
	name: string;
	Editor: FC<{
		node?: GameObject;
		component: ComponentData;
		onUpdate: (newComp: Record<string, unknown>) => void;
		basePath?: string;
	}>;
	defaultProperties: Record<string, unknown>;
	View?: FC<ComponentViewProps>;
	/** Declare which asset paths this component references (for asset loading). */
	getAssetRefs?: (properties: Record<string, unknown>) => AssetRef[];
}

const REGISTRY: Record<string, Component> = {};

export function registerComponent(component: Component) {
	REGISTRY[component.name] = component;
}

export function getComponentDef(name: string): Component | undefined {
	return REGISTRY[name];
}

export function getAllComponentDefs(): Record<string, Component> {
	return { ...REGISTRY };
}

export function getComponentAssetRefs(
	componentType: string,
	properties: Record<string, unknown>,
): AssetRef[] {
	const component = REGISTRY[componentType];
	return component?.getAssetRefs?.(properties) ?? [];
}
