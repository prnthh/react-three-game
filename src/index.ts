// Core
export { default as GameCanvas } from './shared/GameCanvas';
export type { GameCanvasProps } from './shared/GameCanvas';

// Helpers
export { ground } from './helpers';
export type { GroundOptions, Vec3 } from './helpers';
export { sound as soundManager } from './helpers/SoundManager';

// Prefab Editor
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export { PrefabEditorMode } from './tools/prefabeditor/PrefabRoot';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';
export { useEditorContext, useEditorRef } from './tools/prefabeditor/PrefabEditor';
export type { EditorContextType } from './tools/prefabeditor/PrefabEditor';
export { usePrefabStore, usePrefabStoreApi } from './tools/prefabeditor/prefabStore';
export type { PrefabStoreApi, PrefabStoreState } from './tools/prefabeditor/prefabStore';

// Prefab Editor - Data API
export { denormalizePrefab } from './tools/prefabeditor/prefab';
export { gameEvents, useClickEvent, useGameEvent } from './tools/prefabeditor/GameEvents';
export type { ClickEventPayload, ContactEventPayload, GameEventHandler, GameEventMap } from './tools/prefabeditor/GameEvents';

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
  PrefabNode,
  PrefabEditorRef,
} from './tools/prefabeditor/PrefabEditor';
export type { PrefabRootProps } from './tools/prefabeditor/PrefabRoot';
export type { AssetRuntime, NodeApi, LiveRef } from './tools/prefabeditor/assetRuntime';
export { useAssetRuntime, useNode, useNodeHandle, useNodeObject } from './tools/prefabeditor/assetRuntime';
export type { Scene } from './tools/prefabeditor/PrefabRoot';
export { useScene } from './tools/prefabeditor/PrefabRoot';
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
