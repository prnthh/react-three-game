// Core
export { default as GameCanvas } from './shared/GameCanvas';
export type { GameCanvasProps } from './shared/GameCanvas';

// Helpers
export { ground } from './helpers';
export type { GroundOptions, Vec3 } from './helpers';
export { sound as soundManager } from './helpers/SoundManager';

// Prefab Editor
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';
export { useEditorContext } from './tools/prefabeditor/EditorContext';
export type { EditorContextType } from './tools/prefabeditor/EditorContext';

// Prefab Editor - Store & Scene API
export { createPrefabStore, prefabStoreToPrefab } from './tools/prefabeditor/prefabStore';
export type { PrefabStoreApi, PrefabStoreState } from './tools/prefabeditor/prefabStore';
export { createScene } from './tools/prefabeditor/sceneApi';

// Prefab Editor - Component Registry
export { registerComponent } from './tools/prefabeditor/components/ComponentRegistry';

// Prefab Editor - Input Components
export {
  FieldRenderer,
  FieldGroup,
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
  createModelNode,
  createImageNode,
} from './tools/prefabeditor/utils';
export type { ExportGLBOptions } from './tools/prefabeditor/utils';

// Prefab Editor - Types
export type {
  PrefabEditorProps,
  PrefabEditorRef,
} from './tools/prefabeditor/PrefabEditor';
export type {
  SpawnOptions,
  Scene,
  Entity,
  EntityComponent,
  EntityData,
  EntityUpdate,
  PropertyPath,
  SceneUpdates,
} from './tools/prefabeditor/sceneApi';
export type { PrefabRootProps, PrefabRootRef } from './tools/prefabeditor/PrefabRoot';
export type { Component } from './tools/prefabeditor/components/ComponentRegistry';
export type { FieldDefinition, FieldType } from './tools/prefabeditor/components/Input';
export type { Prefab, GameObject, ComponentData as ComponentDefinition } from './tools/prefabeditor/types';

// Game Events (physics + custom events)
export { gameEvents, useGameEvent, getEntityIdFromRigidBody } from './tools/prefabeditor/GameEvents';
export type { GameEventType, GameEventMap, GameEventPayload, PhysicsEventType, InteractionEventType, PhysicsEventPayload, ClickEventPayload } from './tools/prefabeditor/GameEvents';

// Asset Loading
export { loadFiles } from './tools/dragdrop/DragDropLoader';
export type { AssetLoadOptions } from './tools/dragdrop/DragDropLoader';
export { loadModel, loadTexture } from './tools/dragdrop/modelLoader';
export type { LoadedModel, LoadedTexture, LoadedModels, LoadedTextures, ModelLoadResult, ProgressCallback, TextureLoadResult } from './tools/dragdrop/modelLoader';

// Asset Viewer
export {
  TextureListViewer,
  ModelListViewer,
  SoundListViewer,
  TexturePicker,
  ModelPicker,
  SingleTextureViewer,
  SingleModelViewer,
  SingleSoundViewer,
  SharedCanvas,
} from './tools/assetviewer/page';
