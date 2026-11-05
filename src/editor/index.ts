export { EditorSelection } from './selection.js';
export { getPrefabEditorView } from './sceneView.js';
export type { ComponentEditorProps } from "../core/ComponentRegistry.js";

export { default as PrefabEditor, PrefabEditorProvider, PrefabEditorScene, PrefabEditorPanel } from "./PrefabEditor.js";
export type { PrefabEditorProps, PrefabEditorProviderProps, PrefabEditorRef } from "./PrefabEditor.js";

export { useEditorContext, useEditorRef } from "./EditorContext.js";
export type { EditorContextType } from "./EditorContext.js";

export { usePrefabStore, usePrefabStoreApi } from "../runtime/prefabs/PrefabStoreContext.js";
export type { PrefabStoreApi, PrefabStoreState } from "../core/prefabStore.js";

export {
  FieldRenderer,
  UnsettableField,
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
} from "./ui/Input.js";

export {
  loadJsonFile,
  saveJson,
  exportGLB,
  exportGLBData,
  regenerateIds,
  computeParentWorldMatrix,
} from "./documentIO.js";
export type { ExportGLBOptions } from "./documentIO.js";

export { decomposeModelToPrefabNodes } from "./modelPrefab.js";
export type { DecomposeModelOptions, DecomposedPrefabNodes } from "./modelPrefab.js";

export type { FieldDefinition } from "./ui/Input.js";
export { editorTheme } from "./ui/styles.js";
export { loadFiles } from "./assets/DragDropLoader.js";
export type { AssetLoadOptions } from "./assets/DragDropLoader.js";

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
} from "./assets/AssetBrowser.js";

export { registerComponentEditor } from "./ComponentEditors.js";

export type { SceneCommand, SceneCommandBatch, SceneCommandResult } from "../core/sceneCommands.js";

export type { SceneAgent, SceneBatch, SceneSearchOptions, SceneGetManyOptions } from "./agent/sceneAgent.js";
export { createSceneTools, createSceneToolGuide } from './agent/sceneTools.js';
export type { SceneTool, SceneToolResult } from './agent/sceneTools.js';
export { SceneToolsPanel } from './agent/SceneToolsPanel.js';
export { registerSceneWebMCP } from './agent/sceneWebMCP.js';
export type { SceneModelContext, SceneWebMCPStatus } from './agent/sceneWebMCP.js';

export { usePrefabDocument } from "../runtime/prefabs/prefabApi.js";
export type { PrefabDocumentApi } from "../core/prefabDocumentApi.js";

export { loadAssetManifest, type AssetManifest } from '../runtime/assets/assetManifest.js';

export { registerEditorTool, getEditorTool, getEditorTools, subscribeEditorTools, useEditorTools, useEditorToolSession } from './tools/EditorTools.js';
export type { EditorToolDefinition, EditorToolController, EditorToolSession, EditorToolViewportProps, EditorToolPanelProps } from './tools/EditorTools.js';
export { registerEditorNodePreset, getEditorNodePresets, subscribeEditorNodePresets } from './NodePresets.js';
export type { EditorNodePreset } from './NodePresets.js';

export { attachPointerTool } from './tools/pointerTool.js';
export type { PointerToolHandlers, PointerToolOptions, PointerToolControls } from './tools/pointerTool.js';
