// Core Components
export { default as GameCanvas } from './shared/GameCanvas';

// Prefab Editor
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export type { PrefabEditorRef } from './tools/prefabeditor/PrefabEditor';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';
export type { PrefabRootRef } from './tools/prefabeditor/PrefabRoot';
export { registerComponent } from './tools/prefabeditor/components/ComponentRegistry';
export type { Component } from './tools/prefabeditor/components/ComponentRegistry';
export type { Prefab, GameObject, ComponentData } from './tools/prefabeditor/types';
export * as editorStyles from './tools/prefabeditor/styles';
export * from './tools/prefabeditor/utils';

// Asset Tools
export { DragDropLoader } from './tools/dragdrop/DragDropLoader';
export {
  TextureListViewer,
  ModelListViewer,
  SoundListViewer,
  SharedCanvas,
} from './tools/assetviewer/page';

// Helpers
export * from './helpers';
