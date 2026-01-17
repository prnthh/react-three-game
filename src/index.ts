// Core
export { default as GameCanvas } from './shared/GameCanvas';

// Helpers
export * from './helpers';
export { sound as soundManager } from './helpers/SoundManager';

// Prefab Editor - Components
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';

// Prefab Editor - Component Registry
export { registerComponent } from './tools/prefabeditor/components/ComponentRegistry';

// Prefab Editor - Input Components
export {
  FieldRenderer,
  Input,
  Label,
  Vector3Input,
  ColorInput,
  StringInput,
  BooleanInput,
  SelectInput,
} from './tools/prefabeditor/components/Input';

// Prefab Editor - Styles & Utils
export * from './tools/prefabeditor/utils';

// Prefab Editor - Types
export type { PrefabEditorRef } from './tools/prefabeditor/PrefabEditor';
export type { PrefabRootRef } from './tools/prefabeditor/PrefabRoot';
export type { Component } from './tools/prefabeditor/components/ComponentRegistry';
export type { FieldDefinition, FieldType } from './tools/prefabeditor/components/Input';
export type { Prefab, GameObject, ComponentData } from './tools/prefabeditor/types';

// Asset Tools
export { DragDropLoader } from './tools/dragdrop/DragDropLoader';
export {
  TextureListViewer,
  ModelListViewer,
  SoundListViewer,
  SharedCanvas,
} from './tools/assetviewer/page';
