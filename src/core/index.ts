export {
	getComponents,
	getComponentDefaultProperties,
	getComponent,
	registerComponent,
	resolveComponentProperties,
} from "./ComponentRegistry.js";
export type {
	Component,
    ComponentRendering,
    ComponentGeometryModifier,
	ComponentCategory,
	ComponentPropertySchema,
	ComponentPropertyDefinition,
	ComponentPropertyDefinitions,
	ComponentPropertyOption,
	ComponentPropertyType,
	ComponentViewProps,
	NodeInteractionHandlers,
} from "./ComponentRegistry.js";

export { createImageNode, createModelNode, collectSceneMaterials, normalizePrefab, denormalizePrefab } from "./prefab.js";
export type { PrefabState, PrefabNodeRecord, SceneMaterialEntry } from "./prefab.js";
export type {
	ComponentData,
	GameObject,
	MaterialComponentProperties,
	Prefab,
	PrefabMaterial,
	PrefabMaterialType,
} from "./types.js";
export { findComponent, findComponentEntry, hasComponent } from "./types.js";

export type { AssetDependency, ComponentDependency } from "./dependencies.js";

export { decomposeModelToPrefabNodes, importCollisionModel, exportGLBData, importGLBData, loadGLBScene } from './modelPrefab.js';
export type { DecomposeModelOptions, DecomposedPrefabNodes } from './modelPrefab.js';

export { createPrefabStore } from './prefabStore.js';
export type { PrefabStoreApi, PrefabStoreState } from './prefabStore.js';
export { createPrefabDocumentApi, ensureMaterialReference } from './prefabDocumentApi.js';
export type { PrefabDocumentApi } from './prefabDocumentApi.js';
export { evaluateSceneCommands, evaluateSceneCommandState } from './sceneCommands.js';
export type { SceneCommand, SceneCommandBatch, SceneCommandResult } from './sceneCommands.js';
export { describeSceneComponents } from './componentSchemas.js';
export { sceneCommandsSchema, sceneCommandBatchSchema } from './sceneCommandSchema.js';
export { computeParentWorldMatrix, composeTransform, walkPrefabWorldTransforms } from './transforms.js';

export type { ComponentContext, SceneRuntimeContext } from './componentContext.js';

export { compileBoxCollider, compileMeshCollider, parseCollisionName } from "./collision.js";
export type { BoxColliderProperties, MeshColliderProperties, WorldMeshCollider, WorldBox, CollisionVector } from "./collision.js";
