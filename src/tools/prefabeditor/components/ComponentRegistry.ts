import type { FC } from "react";
import type { ThreeEvent } from "@react-three/fiber";
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
	/** Whether this node is currently rendered in editor mode. */
	editMode?: boolean;
	/** Node-level pointer/click handlers for custom components that render their own pickable objects. */
	nodeInteractionHandlers?: NodeInteractionHandlers;
	/** Current node local position for wrapper components. */
	position?: [number, number, number];
	/** Current node local rotation in radians for wrapper components. */
	rotation?: [number, number, number];
	/** Current node local scale for wrapper components. */
	scale?: [number, number, number];
	/** Current node world position. Components that create world-space resources should prefer this. */
	worldPosition?: [number, number, number];
	/** Public asset URL prefix, such as a Next.js basePath. */
	basePath?: string;
}

export type NodeInteractionHandlers = {
	onClick?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
};

export interface Component {
	name: string;
	/** Set when this component occupies a single slot on a node. Use a string to share a slot across component types. */
	disableSiblingComposition?: boolean | string;
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

export function getSiblingCompositionSlot(componentName: string, disableSiblingComposition: boolean | string | undefined) {
	if (!disableSiblingComposition) return null;
	return typeof disableSiblingComposition === "string" ? disableSiblingComposition : componentName;
}

export function canAddComponentToNode(node: GameObject, component: Component | undefined, allComponents = REGISTRY) {
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
