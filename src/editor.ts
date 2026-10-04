export type { ComponentEditorProps } from "./core/ComponentRegistry.js";

export { default as PrefabEditor, PrefabEditorProvider, PrefabEditorScene, PrefabEditorPanel } from "./editor/PrefabEditor.js";
export type { PrefabEditorProps, PrefabEditorProviderProps, PrefabEditorRef } from "./editor/PrefabEditor.js";

export { useEditorContext, useEditorRef } from "./editor/EditorContext.js";
export type { EditorContextType } from "./editor/EditorContext.js";

export { usePrefabStore, usePrefabStoreApi } from "./runtime/prefabs/PrefabStoreContext.js";
export type { PrefabStoreApi, PrefabStoreState } from "./core/prefabStore.js";

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
} from "./editor/ui/Input.js";

export {
  loadJson,
  saveJson,
  exportGLB,
  exportGLBData,
  regenerateIds,
  computeParentWorldMatrix,
} from "./editor/documentIO.js";
export type { ExportGLBOptions } from "./editor/documentIO.js";

export { decomposeModelToPrefabNodes } from "./editor/modelPrefab.js";
export type { DecomposeModelOptions, DecomposedPrefabNodes } from "./editor/modelPrefab.js";

export type { FieldDefinition } from "./editor/ui/Input.js";
export { editorTheme } from "./editor/ui/styles.js";
export { loadFiles } from "./editor/assets/DragDropLoader.js";
export type { AssetLoadOptions } from "./editor/assets/DragDropLoader.js";

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
} from "./editor/assets/AssetBrowser.js";

export { registerComponentEditor } from "./editor/ComponentEditors.js";

export type { SceneCommand, SceneCommandBatch, SceneCommandResult } from "./core/sceneCommands.js";

export type { SceneAgent, SceneBatch, SceneSearchOptions, SceneGetManyOptions } from "./editor/agent/sceneAgent.js";

export { usePrefabDocument } from "./runtime/prefabs/prefabApi.js";
export type { PrefabDocumentApi } from "./core/prefabDocumentApi.js";
