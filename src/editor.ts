import { registerBuiltinComponentEditors } from "./tools/prefabeditor/components";
import "./index";

registerBuiltinComponentEditors();

export type { ComponentEditorProps } from "./tools/prefabeditor/components/ComponentRegistry";

export { default as PrefabEditor } from "./tools/prefabeditor/PrefabEditor";
export type { PrefabEditorProps, PrefabEditorRef } from "./tools/prefabeditor/PrefabEditor";

export { useEditorContext, useEditorRef } from "./tools/prefabeditor/EditorContext";
export type { EditorContextType } from "./tools/prefabeditor/EditorContext";

export { usePrefabStore, usePrefabStoreApi } from "./tools/prefabeditor/prefabStore";
export type { PrefabStoreApi, PrefabStoreState } from "./tools/prefabeditor/prefabStore";

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
} from "./tools/prefabeditor/components/Input";

export {
  loadJson,
  saveJson,
  exportGLB,
  exportGLBData,
  regenerateIds,
  computeParentWorldMatrix,
} from "./tools/prefabeditor/utils";
export type { ExportGLBOptions } from "./tools/prefabeditor/utils";

export { decomposeModelToPrefabNodes } from "./tools/prefabeditor/modelPrefab";
export type { DecomposeModelOptions, DecomposedPrefabNodes } from "./tools/prefabeditor/modelPrefab";

export type { FieldDefinition } from "./tools/prefabeditor/components/Input";
export { loadFiles } from "./tools/dragdrop/DragDropLoader";
export type { AssetLoadOptions } from "./tools/dragdrop/DragDropLoader";

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
} from "./tools/assetviewer/page";
