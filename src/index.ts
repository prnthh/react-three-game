// Core
export { default as GameCanvas } from './shared/GameCanvas';
export type { GameCanvasProps } from './shared/GameCanvas';

// Helpers
export { ground } from './helpers';
export type { GroundOptions, Vec3 } from './helpers';
export { sound as soundManager } from './helpers/SoundManager';

// Prefab Editor
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export { PrefabEditorMode } from './tools/prefabeditor/PrefabEditor';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';
export { useEditorContext } from './tools/prefabeditor/PrefabEditor';
export type { EditorContextType } from './tools/prefabeditor/PrefabEditor';

// Prefab Editor - Store & Scene API
export { createPrefabStore, prefabStoreToPrefab, usePrefabStoreApi } from './tools/prefabeditor/prefabStore';
export type { PrefabStoreApi, PrefabStoreState } from './tools/prefabeditor/prefabStore';
export { denormalizePrefab } from './tools/prefabeditor/prefab';

// Prefab Editor - Component Registry
export { registerComponent } from './tools/prefabeditor/components/ComponentRegistry';

// Prefab Editor - Input Components
export {
  FieldRenderer,
  FieldGroup,
  ListEditor,
  Label,
  Vector3Input,
  Vector3Field,
  NumberField,
  ColorInput,
  ColorField,
  StringInput,
  StringField,
  BooleanInput,
  BooleanField,
  SelectInput,
  SelectField,
} from './tools/prefabeditor/components/Input';

// Prefab Editor - Utils
export {
  loadJson,
  saveJson,
  exportGLB,
  exportGLBData,
  regenerateIds,
  computeParentWorldMatrix,
} from './tools/prefabeditor/utils';
export type { ExportGLBOptions } from './tools/prefabeditor/utils';
export {
  createModelNode,
  createImageNode,
} from './tools/prefabeditor/prefab';

// Prefab Editor - Types
export type {
  PrefabEditorProps,
  PrefabEditorRef,
} from './tools/prefabeditor/PrefabEditor';
export type {
  SpawnOptions,
} from './tools/prefabeditor/scene';
export type { PrefabRootProps } from './tools/prefabeditor/PrefabRoot';
export type { AssetRuntime, EntityRuntime, LiveObjectRef, LiveRigidBodyRef } from './tools/prefabeditor/assetRuntime';
export { useAssetRuntime, useEntityRuntime, useEntityObjectRef, useEntityRigidBodyRef } from './tools/prefabeditor/assetRuntime';
export type { Component, ComponentViewProps } from './tools/prefabeditor/components/ComponentRegistry';
export type { FieldDefinition, FieldType } from './tools/prefabeditor/components/Input';
export { MaterialOverridesProvider, useMaterialOverrides } from './tools/prefabeditor/components/MaterialComponent';
export type { MaterialOverrides } from './tools/prefabeditor/components/MaterialComponent';
export type { Prefab, GameObject, ComponentData } from './tools/prefabeditor/types';
export { findComponent, findComponentEntry, hasComponent } from './tools/prefabeditor/types';
export {
  float,
  positionLocal,
  sin,
  time,
  uniform,
  vec3,
} from 'three/tsl';

// Asset Loading
export { loadFiles } from './tools/dragdrop/DragDropLoader';
export type { AssetLoadOptions } from './tools/dragdrop/DragDropLoader';
export { loadModel, loadSound, loadTexture } from './tools/dragdrop/modelLoader';
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
} from './tools/dragdrop/modelLoader';

// Asset Viewer
export {
  ModelListViewer,
  SoundListViewer,
  ModelPicker,
  SoundPicker,
  TextureListViewer,
  TexturePicker,
  SingleModelViewer,
  SingleSoundViewer,
  SingleTextureViewer,
  SharedCanvas,
} from './tools/assetviewer/page';
export type { PrefabRootRef } from './tools/prefabeditor/PrefabRoot';
