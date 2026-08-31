export {
	getAllComponentDefs,
	getComponentDefaultProperties,
	getComponentDef,
	registerComponent,
	resolveComponentProperties,
} from "./tools/prefabeditor/components/ComponentRegistry";
export type {
	Component,
	ComponentPropertyDefinition,
	ComponentPropertyDefinitions,
	ComponentPropertyOption,
	ComponentPropertyType,
	ComponentViewProps,
	NodeInteractionHandlers,
} from "./tools/prefabeditor/components/ComponentRegistry";

export { createImageNode, createModelNode, denormalizePrefab } from "./tools/prefabeditor/prefab";
export type {
	ComponentData,
	GameObject,
	MaterialComponentProperties,
	Prefab,
	PrefabMaterial,
	PrefabMaterialType,
} from "./tools/prefabeditor/types";
export { findComponent, findComponentEntry, hasComponent } from "./tools/prefabeditor/types";
