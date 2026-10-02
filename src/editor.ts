export type { ComponentEditorProps } from "./core/ComponentRegistry";

export { default as PrefabEditor, PrefabEditorProvider, PrefabEditorScene, PrefabEditorPanel } from "./editor/PrefabEditor";
export type { PrefabEditorProps, PrefabEditorProviderProps, PrefabEditorRef } from "./editor/PrefabEditor";

export { useEditorContext, useEditorRef } from "./editor/EditorContext";
export type { EditorContextType } from "./editor/EditorContext";

export { usePrefabStore, usePrefabStoreApi } from "./runtime/prefabs/PrefabStoreContext";
export type { PrefabStoreApi, PrefabStoreState } from "./core/prefabStore";

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
} from "./editor/ui/Input";

export {
  loadJson,
  saveJson,
  exportGLB,
  exportGLBData,
  regenerateIds,
  computeParentWorldMatrix,
} from "./editor/documentIO";
export type { ExportGLBOptions } from "./editor/documentIO";

export { decomposeModelToPrefabNodes } from "./editor/modelPrefab";
export type { DecomposeModelOptions, DecomposedPrefabNodes } from "./editor/modelPrefab";

export type { FieldDefinition } from "./editor/ui/Input";
export { editorTheme } from "./editor/ui/styles";
export { loadFiles } from "./editor/assets/DragDropLoader";
export type { AssetLoadOptions } from "./editor/assets/DragDropLoader";

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
} from "./editor/assets/AssetBrowser";

export { registerComponentEditor } from "./editor/ComponentEditors";

export type { SceneCommand, SceneCommandBatch, SceneCommandResult } from "./editor/agent/sceneCommands";

export type { SceneAgent, SceneBatch, SceneSearchOptions, SceneGetManyOptions } from "./editor/agent/sceneAgent";

export { usePrefabDocument } from "./runtime/prefabs/prefabApi";
export type { PrefabDocumentApi } from "./core/prefabDocumentApi";
