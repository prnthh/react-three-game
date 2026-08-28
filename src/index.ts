import "./tools/prefabeditor/components";

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
	PrefabContext,
	useScene,
	usePrefab,
	useNode,
	useNodeHandle,
	useNodeObject,
} from "./tools/prefabeditor/SceneContext";
export type { LiveRef, NodeApi, PrefabApi, PrefabNode, Scene } from "./tools/prefabeditor/SceneContext";
export { SceneProvider } from "./tools/prefabeditor/SceneProvider";

export type {
	AssetRuntime,
} from "./tools/prefabeditor/assetRuntime";
export {
	useAssetRuntime,
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

export { registerRuntimeWrapper } from "./tools/prefabeditor/RuntimeWrapperRegistry";
export type { RuntimeWrapper } from "./tools/prefabeditor/RuntimeWrapperRegistry";

export {
	denormalizePrefab,
	createModelNode,
	createImageNode,
} from "./tools/prefabeditor/prefab";
export type {
	Prefab,
	PrefabMaterial,
	PrefabMaterialType,
	MaterialComponentProperties,
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

export { MaterialOverridesProvider, useMaterialOverrides } from "./tools/prefabeditor/components/MaterialComponent";
export type { MaterialOverrides } from "./tools/prefabeditor/components/MaterialComponent";

export { CAMERA_POSITION_ROUTE_HANDLE } from "./tools/prefabeditor/components/CameraComponent";
export type { CameraPositionRoute } from "./tools/prefabeditor/components/CameraComponent";

export {
	float,
	positionLocal,
	sin,
	time,
	uniform,
	vec3,
} from "three/tsl";
