export * from "./core";

export { default as GameCanvas } from "./shared/GameCanvas";
export type { GameCanvasProps } from "./shared/GameCanvas";

export { sound as soundManager, SoundManager } from "./helpers/SoundManager";
export type { SoundOptions, SoundPlayback } from "./helpers/SoundManager";

export { default as PrefabRoot } from "./tools/prefabeditor/PrefabRoot";
export type { PrefabRootProps } from "./tools/prefabeditor/PrefabRoot";

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
} from "./tools/prefabeditor/SceneContext";
export { ANIMATED_MODEL_COMPONENT } from "./tools/prefabeditor/components/AnimatedModelComponent";
export type { AnimatedModelHandle, AnimatedModelProperties } from "./tools/prefabeditor/components/AnimatedModelComponent";
export type { NodeApi, NodeComponentType, PrefabApi, PrefabNode, Scene, SceneComponent } from "./tools/prefabeditor/SceneContext";
export { SceneProvider } from "./tools/prefabeditor/SceneProvider";

export type { AssetRuntime } from "./tools/prefabeditor/assetRuntime";
export {
	useAssetRuntime,
	useTextureAsset,
	useScenePendingLoads,
	AssetRuntimeProvider,
} from "./tools/prefabeditor/assetRuntime";

export { GameEventsProvider, createGameEvents, useGameEvents, useGameEvent } from "./tools/prefabeditor/GameEvents";
export type {
	GameEvents,
	ContactEventPayload,
	GameEventHandler,
	GameEventMap,
	NodePointerEventPayload,
} from "./tools/prefabeditor/GameEvents";

export { loadModel, loadSound, loadTexture } from "./tools/dragdrop/modelLoader";
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
} from "./tools/dragdrop/modelLoader";

export { MaterialOverridesProvider, useMaterialOverrides } from "./tools/prefabeditor/components/MaterialComponent";
export type { MaterialOverrides } from "./tools/prefabeditor/components/MaterialComponent";

export { PrefabInstance } from "./runtime/PrefabInstance";
export type { PrefabInstanceProps, PrefabInstanceStatus } from "./runtime/PrefabInstance";
export type { PreparedPrefab, PrefabPreparationOptions, AssetDependency, ComponentDependency } from "./runtime/preparePrefab";
export { useSceneLoadStats } from "./tools/prefabeditor/assetRuntime";
export { createPrefabStore, usePrefabStore, usePrefabStoreApi } from "./tools/prefabeditor/prefabStore";
export type { PrefabStoreApi, PrefabStoreState } from "./tools/prefabeditor/prefabStore";

export type { SharedMaterialOptions } from "./tools/prefabeditor/components/MaterialComponent";
export { useSharedMaterialResource } from "./tools/prefabeditor/components/MaterialComponent";

export { withBasePath as resolveAssetPath } from "./tools/prefabeditor/runtimeUtils";

export { CascadedDirectionalLight } from './runtime/lighting/CascadedDirectionalLight';
export type { CascadedDirectionalLightProps } from './runtime/lighting/CascadedDirectionalLight';

export { SceneRuntime } from "./runtime/SceneRuntime";

export type { GameObjectHandle } from "./tools/prefabeditor/gameObject";

export { usePrefabDocument, createPrefabDocumentApi } from "./tools/prefabeditor/prefabApi";
export type { PrefabDocumentApi } from "./tools/prefabeditor/SceneContext";
