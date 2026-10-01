export {
	getComponents,
	getComponentDefaultProperties,
	getComponent,
	registerComponent,
	resolveComponentProperties,
} from "./core/ComponentRegistry";
export type {
	Component,
	ComponentPropertySchema,
	ComponentPropertyDefinition,
	ComponentPropertyDefinitions,
	ComponentPropertyOption,
	ComponentPropertyType,
	ComponentViewProps,
	NodeInteractionHandlers,
} from "./core/ComponentRegistry";

export { createImageNode, createModelNode, denormalizePrefab } from "./core/prefab";
export type {
	ComponentData,
	GameObject,
	MaterialComponentProperties,
	Prefab,
	PrefabMaterial,
	PrefabMaterialType,
} from "./core/types";
export { findComponent, findComponentEntry, hasComponent } from "./core/types";

export type { AssetDependency, ComponentDependency } from "./core/dependencies";
