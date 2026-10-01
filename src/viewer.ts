export * from "./core";

export { default as GameCanvas } from "./runtime/GameCanvas";
export type { GameCanvasProps } from "./runtime/GameCanvas";

export { sound as soundManager, SoundManager } from "./runtime/audio/SoundManager";
export type { SoundOptions, SoundPlayback } from "./runtime/audio/SoundManager";

export { default as PrefabRoot } from "./runtime/prefabs/PrefabRoot";
export type { PrefabRootProps } from "./runtime/prefabs/PrefabRoot";

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
} from "./runtime/scene/SceneContext";
export { ANIMATED_MODEL_COMPONENT } from "./runtime/components/AnimatedModelComponent";
export type { AnimatedModelHandle, AnimatedModelProperties } from "./runtime/components/AnimatedModelComponent";
export type { NodeApi, NodeComponentType, PrefabApi, PrefabNode, Scene, SceneComponent } from "./runtime/scene/SceneContext";
export { SceneProvider } from "./runtime/scene/SceneProvider";

export type { AssetRuntime } from "./runtime/assets/AssetRuntime";
export {
	useAssetRuntime,
	useTextureAsset,
	useScenePendingLoads,
	AssetRuntimeProvider,
} from "./runtime/assets/AssetRuntime";

export { GameEventsProvider, createGameEvents, useGameEvents, useGameEvent } from "./runtime/scene/GameEvents";
export type {
	GameEvents,
	ContactEventPayload,
	GameEventHandler,
	GameEventMap,
	NodePointerEventPayload,
} from "./runtime/scene/GameEvents";

export { loadModel, loadSound, loadTexture } from "./runtime/assets/assetLoaders";
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
} from "./runtime/assets/assetLoaders";

export { MaterialOverridesProvider, useMaterialOverrides } from "./runtime/components/MaterialComponent";
export type { MaterialOverrides } from "./runtime/components/MaterialComponent";

export { PrefabInstance } from "./runtime/prefabs/PrefabInstance";
export type { PrefabInstanceProps, PrefabInstanceStatus } from "./runtime/prefabs/PrefabInstance";
export type { PreparedPrefab, PrefabPreparationOptions, AssetDependency, ComponentDependency } from "./runtime/prefabs/preparePrefab";
export { useSceneLoadStats } from "./runtime/assets/AssetRuntime";
export { createPrefabStore } from "./core/prefabStore";
export { usePrefabStore, usePrefabStoreApi } from "./runtime/prefabs/PrefabStoreContext";
export type { PrefabStoreApi, PrefabStoreState } from "./core/prefabStore";

export type { SharedMaterialOptions } from "./runtime/components/MaterialComponent";
export { useSharedMaterialResource } from "./runtime/components/MaterialComponent";
export { useInvalidateMeshInstances } from "./runtime/rendering/MeshInstanceProvider";

export { withBasePath as resolveAssetPath } from "./runtime/assets/assetPaths";

export { CascadedDirectionalLight } from './runtime/lighting/CascadedDirectionalLight';
export type { CascadedDirectionalLightProps } from './runtime/lighting/CascadedDirectionalLight';
export { LightCullingGrid, LightCullingGridController } from './runtime/lighting/LightCullingGrid';
export type { LightCullingGridOptions } from './runtime/lighting/LightCullingGrid';

export { SceneRuntime } from "./runtime/SceneRuntime";

export type { GameObjectHandle } from "./runtime/scene/gameObject";
export { notifyObjectChanged } from "./runtime/scene/objectChanges";

export { usePrefabDocument, createPrefabDocumentApi } from "./runtime/prefabs/prefabApi";
export type { PrefabDocumentApi } from "./runtime/scene/SceneContext";

export { default as RuntimeComponent } from "./runtime/components/RuntimeComponent";
export type { RuntimeComponentProperties, RuntimeScriptContext } from "./runtime/components/RuntimeComponent";

export { useSharedGeometryResource } from "./runtime/components/GeometryComponent";
