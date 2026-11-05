export * from "../core/index.js";

export { default as GameCanvas } from "../runtime/GameCanvas.js";
export type { GameCanvasProps } from "../runtime/GameCanvas.js";

export { sound as soundManager, SoundManager } from "../runtime/audio/SoundManager.js";
export type { SoundOptions, SoundPlayback } from "../runtime/audio/SoundManager.js";

export { default as PrefabRoot } from "../runtime/prefabs/PrefabRoot.js";
export type { PrefabRootProps } from "../runtime/prefabs/PrefabRoot.js";
export { NodeMountBudget } from '../runtime/prefabs/NodeMountBudget.js';
export { registerSceneCaptureRenderer } from '../runtime/rendering/sceneCapture.js';

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
} from "../runtime/scene/SceneContext.js";
export { SKINNED_MESH_COMPONENT, useSkinnedModel } from "../runtime/components/SkinnedMeshComponent.js";
export type { SkinnedMeshHandle, SkinnedMeshProperties, SkinnedModelOptions } from "../runtime/components/SkinnedMeshComponent.js";
export { TwoBoneIK } from '../runtime/animation/TwoBoneIK.js';
export { default as BoneAttachmentComponent } from "../runtime/components/BoneAttachmentComponent.js";
export type { BoneAttachmentProperties } from "../runtime/components/BoneAttachmentComponent.js";
export type { NodeApi, NodeComponentType, PrefabApi, PrefabNode, Scene, SceneComponent } from "../runtime/scene/SceneContext.js";

export type { AssetRuntime } from "../runtime/assets/AssetRuntime.js";
export {
	useAssetRuntime,
	useTextureAsset,
	AssetRuntimeProvider,
} from "../runtime/assets/AssetRuntime.js";

export { GameEventsProvider, createGameEvents, useGameEvents, useGameEvent } from "../runtime/scene/GameEvents.js";
export type {
	GameEvents,
	ContactEventPayload,
	GameEventHandler,
	GameEventMap,
	NodePointerEventPayload,
} from "../runtime/scene/GameEvents.js";

export { loadModel, loadSound, loadTexture } from "../runtime/assets/assetLoaders.js";
export type { ProgressCallback } from "../runtime/assets/assetLoaders.js";

export { default as MaterialComponent, MaterialOverridesProvider, useMaterialOverrides } from "../runtime/components/MaterialComponent.js";
export type { MaterialOverrides } from "../runtime/components/MaterialComponent.js";

export { PrefabInstance } from "../runtime/prefabs/PrefabInstance.js";
export type { PrefabInstanceProps, PrefabInstanceStatus, PrefabChunkStatus } from "../runtime/prefabs/PrefabInstance.js";
export type { PrefabStreamingOptions } from '../runtime/prefabs/spatialPrefabPlan.js';
export { registerPrefabCompilationContext } from '../runtime/rendering/compileInSlices.js';
export type { PreparedPrefab, PrefabPreparationOptions } from "../runtime/prefabs/preparePrefab.js";
export { usePrefabStore, usePrefabStoreApi } from "../runtime/prefabs/PrefabStoreContext.js";

export type { SharedMaterialOptions } from "../runtime/components/MaterialComponent.js";
export { useSharedMaterialResource } from "../runtime/components/MaterialComponent.js";
export { useInvalidateMeshInstances } from "../runtime/rendering/MeshInstanceProvider.js";

export { withBasePath as resolveAssetPath } from "../runtime/assets/assetPaths.js";

export { CascadedDirectionalLight } from '../runtime/lighting/CascadedDirectionalLight.js';
export type { CascadedDirectionalLightProps } from '../runtime/lighting/CascadedDirectionalLight.js';

export { SceneRuntime } from "../runtime/SceneRuntime.js";

export type { GameObjectHandle } from "../runtime/scene/gameObject.js";
export { notifyObjectChanged } from "../runtime/scene/objectChanges.js";

export { usePrefabDocument } from "../runtime/prefabs/prefabApi.js";

export { default as RuntimeComponent } from "../runtime/components/RuntimeComponent.js";
export type { RuntimeComponentProperties, RuntimeScriptContext } from "../runtime/components/RuntimeComponent.js";

export { useSharedGeometryResource } from "../runtime/components/GeometryComponent.js";

export { DEFAULT_SPATIAL_CELL_SIZE } from '../runtime/spatial/spatialCell.js';
export { getSceneComponentRegistry } from '../runtime/scene/SceneContext.js';

export { resolveGameObject, resolveRenderSource, registerGameObjectOwner, registerRenderSources } from '../runtime/scene/gameObject.js';
export type { NodeComponentRegistry } from '../runtime/scene/SceneContext.js';

export { BrowserRuntime } from '../browser/index.js';

export { registerBuiltInComponents } from '../runtime/components/index.js';

export { default as TerrainComponent } from "../runtime/components/TerrainComponent.js";
export type { TerrainProperties, TerrainLayer } from "../runtime/components/TerrainComponent.js";

export { TERRAIN_SURFACE_COMPONENT } from '../runtime/terrain/terrainSurface.js';
export type { TerrainSurface } from '../runtime/terrain/terrainSurface.js';

export { default as BoxColliderComponent } from "../runtime/components/BoxColliderComponent.js";

export { useComponentActive } from '../runtime/scene/useComponentActive.js';
