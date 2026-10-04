export {
	getComponents,
	getComponentDefaultProperties,
	getComponent,
	registerComponent,
	resolveComponentProperties,
} from "./core/ComponentRegistry.js";
export type {
	Component,
	ComponentCategory,
	ComponentPropertySchema,
	ComponentPropertyDefinition,
	ComponentPropertyDefinitions,
	ComponentPropertyOption,
	ComponentPropertyType,
	ComponentViewProps,
	NodeInteractionHandlers,
} from "./core/ComponentRegistry.js";

export { createImageNode, createModelNode, normalizePrefab, denormalizePrefab } from "./core/prefab.js";
export type { PrefabState, PrefabNodeRecord } from "./core/prefab.js";
export type {
	ComponentData,
	GameObject,
	MaterialComponentProperties,
	Prefab,
	PrefabMaterial,
	PrefabMaterialType,
} from "./core/types.js";
export { findComponent, findComponentEntry, hasComponent } from "./core/types.js";

export type { AssetDependency, ComponentDependency } from "./core/dependencies.js";

export { decomposeModelToPrefabNodes, exportGLBData, importGLBData, loadGLBScene } from './core/modelPrefab.js';
export type { DecomposeModelOptions, DecomposedPrefabNodes } from './core/modelPrefab.js';

export { createPrefabStore } from './core/prefabStore.js';
export type { PrefabStoreApi, PrefabStoreState } from './core/prefabStore.js';
export { createPrefabDocumentApi } from './core/prefabDocumentApi.js';
export type { PrefabDocumentApi } from './core/prefabDocumentApi.js';
export { evaluateSceneCommands, evaluateSceneCommandState } from './core/sceneCommands.js';
export type { SceneCommand, SceneCommandBatch, SceneCommandResult } from './core/sceneCommands.js';
export { describeSceneComponents } from './core/componentSchemas.js';
export { sceneCommandsSchema, sceneCommandBatchSchema } from './core/sceneCommandSchema.js';
export { computeParentWorldMatrix } from './core/transforms.js';
