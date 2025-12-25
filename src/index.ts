// Components
export { default as GameCanvas } from './shared/GameCanvas';
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';
export { DragDropLoader } from './tools/dragdrop/DragDropLoader';
export {
  TextureListViewer,
  ModelListViewer,
  SoundListViewer,
  SharedCanvas,
} from './tools/assetviewer/page';

// Component Registry
export { registerComponent } from './tools/prefabeditor/components/ComponentRegistry';
export type { Component } from './tools/prefabeditor/components/ComponentRegistry';

// Editor Styles & Utils
export * as editorStyles from './tools/prefabeditor/styles';
export * from './tools/prefabeditor/utils';

// Helpers
export * from './helpers';

// Types
export type { Prefab, GameObject, ComponentData } from './tools/prefabeditor/types';
