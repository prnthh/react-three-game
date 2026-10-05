export type { ComponentEditorProps } from "../core/ComponentRegistry.js";

export { default as PrefabEditor, PrefabEditorProvider, PrefabEditorScene, PrefabEditorPanel } from "./PrefabEditor.js";
export type { PrefabEditorProps, PrefabEditorProviderProps, PrefabEditorRef } from "./PrefabEditor.js";

export { useEditorContext, useEditorRef } from "./EditorContext.js";
export type { EditorContextType } from "./EditorContext.js";

export { usePrefabStore, usePrefabStoreApi } from "../runtime/prefabs/PrefabStoreContext.js";
export type { PrefabStoreApi, PrefabStoreState } from "../core/prefabStore.js";

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
} from "./ui/Input.js";

export {
  loadJson,
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

export { usePrefabDocument } from "../runtime/prefabs/prefabApi.js";
export type { PrefabDocumentApi } from "../core/prefabDocumentApi.js";

export { loadAssetManifest, type AssetManifest } from '../runtime/assets/assetManifest.js';
