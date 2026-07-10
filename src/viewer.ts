export { default as GameCanvas } from "./shared/GameCanvas";
export type { GameCanvasProps } from "./shared/GameCanvas";

export { ground } from "./helpers";
export type { GroundOptions, Vec3 } from "./helpers";
export { sound as soundManager } from "./helpers/SoundManager";

export { default as PrefabRoot } from "./tools/prefabeditor/PrefabRoot";
export type { PrefabRootProps } from "./tools/prefabeditor/PrefabRoot";

export {
	PrefabEditorMode,
	SceneContext,
	useScene,
} from "./tools/prefabeditor/SceneContext";
export type { PrefabNode, Scene } from "./tools/prefabeditor/SceneContext";
export { SceneProvider } from "./tools/prefabeditor/SceneProvider";

export type {
	AssetRuntime,
	NodeApi,
	LiveRef,
} from "./tools/prefabeditor/assetRuntime";
export {
	useAssetRuntime,
	useNode,
	useNodeHandle,
	useNodeObject,
	AssetRuntimeProvider,
} from "./tools/prefabeditor/assetRuntime";

export {
	gameEvents,
	useGameEvent,
} from "./tools/prefabeditor/GameEvents";
export type {
	ContactEventPayload,
	GameEventHandler,
	GameEventMap,
	NodePointerEventPayload,
} from "./tools/prefabeditor/GameEvents";

export { registerComponent } from "./tools/prefabeditor/components/ComponentRegistry";
export type {
	Component,
	ComponentViewProps,
	NodeInteractionHandlers,
} from "./tools/prefabeditor/components/ComponentRegistry";

export {
	denormalizePrefab,
	createModelNode,
	createImageNode,
} from "./tools/prefabeditor/prefab";
export type {
	Prefab,
	GameObject,
	ComponentData,
} from "./tools/prefabeditor/types";
export {
	findComponent,
	findComponentEntry,
	hasComponent,
} from "./tools/prefabeditor/types";

export {
	loadModel,
	loadSound,
	loadTexture,
} from "./tools/dragdrop/modelLoader";
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
