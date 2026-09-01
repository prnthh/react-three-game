export * from "./core";

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
	useSceneComponents,
	useNodeObject,
	useRegisterNodeComponent,
	createNodeComponentType,
} from "./tools/prefabeditor/SceneContext";
export { ANIMATED_MODEL_COMPONENT } from "./tools/prefabeditor/components/AnimatedModelComponent";
export type { AnimatedModelHandle, AnimatedModelProperties } from "./tools/prefabeditor/components/AnimatedModelComponent";
export type { LiveRef, NodeApi, NodeComponentType, PrefabApi, PrefabNode, Scene, SceneComponent } from "./tools/prefabeditor/SceneContext";
export { SceneProvider } from "./tools/prefabeditor/SceneProvider";

export type {
	AssetRuntime,
} from "./tools/prefabeditor/assetRuntime";
export {
	useAssetRuntime,
	useTextureAsset,
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
export { CAMERA_DEFAULTS } from "./tools/prefabeditor/components/CameraComponent";
export type { CameraProjection, CameraProperties } from "./tools/prefabeditor/components/CameraComponent";

export {
	MESH_INSTANCING_MATERIAL_FACTORY,
	MESH_INSTANCE_MATERIALS_CHANGED_EVENT,
} from "./tools/prefabeditor/MeshInstanceProvider";
export type { MeshInstancingMaterialFactory } from "./tools/prefabeditor/MeshInstanceProvider";

export {
	float,
	positionLocal,
	sin,
	time,
	uniform,
	vec3,
} from "three/tsl";
