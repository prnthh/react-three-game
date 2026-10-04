export * from "./core.js";

export { default as GameCanvas } from "./runtime/GameCanvas.js";
export type { GameCanvasProps } from "./runtime/GameCanvas.js";

export { sound as soundManager, SoundManager } from "./runtime/audio/SoundManager.js";
export type { SoundOptions, SoundPlayback } from "./runtime/audio/SoundManager.js";

export { default as PrefabRoot } from "./runtime/prefabs/PrefabRoot.js";
export type { PrefabRootProps } from "./runtime/prefabs/PrefabRoot.js";

export {
	PrefabEditorMode,
	SceneContext,
	PrefabContext,
	useScene,
	usePrefab,
	useNode,
	useSceneComponents,
	useGameObject,
	useRegisterNodeComponent,
	createNodeComponentType,
} from "./runtime/scene/SceneContext.js";
export { SKINNED_MESH_COMPONENT } from "./runtime/components/SkinnedMeshComponent.js";
export type { SkinnedMeshHandle, SkinnedMeshProperties } from "./runtime/components/SkinnedMeshComponent.js";
export type { NodeApi, NodeComponentType, PrefabApi, PrefabNode, Scene, SceneComponent } from "./runtime/scene/SceneContext.js";
export { SceneProvider } from "./runtime/scene/SceneProvider.js";

export type { AssetRuntime } from "./runtime/assets/AssetRuntime.js";
export {
	useAssetRuntime,
	useTextureAsset,
	AssetRuntimeProvider,
} from "./runtime/assets/AssetRuntime.js";

export { GameEventsProvider, createGameEvents, useGameEvents, useGameEvent } from "./runtime/scene/GameEvents.js";
export type {
	GameEvents,
	ContactEventPayload,
	GameEventHandler,
	GameEventMap,
	NodePointerEventPayload,
} from "./runtime/scene/GameEvents.js";

export { loadModel, loadSound, loadTexture } from "./runtime/assets/assetLoaders.js";
export type {
	LoadedModel,
	LoadedModels,
	ModelLoadResult,
	LoadedSound,
	LoadedSounds,
	SoundLoadResult,
	LoadedTexture,
	LoadedTextures,
	TextureLoadResult,
	ProgressCallback,
} from "./runtime/assets/assetLoaders.js";

export { default as MaterialComponent, MaterialOverridesProvider, useMaterialOverrides } from "./runtime/components/MaterialComponent.js";
export type { MaterialOverrides } from "./runtime/components/MaterialComponent.js";

export { PrefabInstance } from "./runtime/prefabs/PrefabInstance.js";
export type { PrefabInstanceProps, PrefabInstanceStatus } from "./runtime/prefabs/PrefabInstance.js";
export type { PreparedPrefab, PrefabPreparationOptions } from "./runtime/prefabs/preparePrefab.js";
export { createPrefabStore } from "./core/prefabStore.js";
export { usePrefabStore, usePrefabStoreApi } from "./runtime/prefabs/PrefabStoreContext.js";
export type { PrefabStoreApi, PrefabStoreState } from "./core/prefabStore.js";

export type { SharedMaterialOptions } from "./runtime/components/MaterialComponent.js";
export { useSharedMaterialResource } from "./runtime/components/MaterialComponent.js";
export { useInvalidateMeshInstances } from "./runtime/rendering/MeshInstanceProvider.js";

export { withBasePath as resolveAssetPath } from "./runtime/assets/assetPaths.js";

export { CascadedDirectionalLight } from './runtime/lighting/CascadedDirectionalLight.js';
export type { CascadedDirectionalLightProps } from './runtime/lighting/CascadedDirectionalLight.js';
export { LightCullingGrid, LightCullingGridController } from './runtime/lighting/LightCullingGrid.js';
export type { LightCullingGridOptions } from './runtime/lighting/LightCullingGrid.js';

export { SceneRuntime } from "./runtime/SceneRuntime.js";

export type { GameObjectHandle } from "./runtime/scene/gameObject.js";
export { notifyObjectChanged } from "./runtime/scene/objectChanges.js";

export { usePrefabDocument } from "./runtime/prefabs/prefabApi.js";
export { createPrefabDocumentApi } from "./core/prefabDocumentApi.js";
export type { PrefabDocumentApi } from "./core/prefabDocumentApi.js";

export { default as RuntimeComponent } from "./runtime/components/RuntimeComponent.js";
export type { RuntimeComponentProperties, RuntimeScriptContext } from "./runtime/components/RuntimeComponent.js";

export { useSharedGeometryResource } from "./runtime/components/GeometryComponent.js";

export { SpatialGrid, DEFAULT_SPATIAL_CELL_SIZE } from './runtime/spatial/SpatialGrid.js';
export { getSceneComponentRegistry } from './runtime/scene/SceneContext.js';
export { SCENE_OBJECT, SCENE_LIGHT } from './runtime/scene/SceneGraphRegistration.js';

export { resolveGameObject, resolveRenderSource, registerGameObjectOwner, registerRenderSources } from './runtime/scene/gameObject.js';
export type { NodeComponentRegistry } from './runtime/scene/SceneContext.js';

export { exportGLBData } from './core/modelPrefab.js';
export { BrowserRuntime } from './browser.js';

export { registerBuiltInComponents } from './runtime/components/index.js';

export { useSceneRuntimeContext } from './runtime/scene/ComponentLifecycle.js';
export type { ComponentContext, SceneRuntimeContext } from './runtime/scene/ComponentLifecycle.js';
