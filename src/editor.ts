import { registerBuiltinComponents } from "./tools/prefabeditor/components";
import "./viewer";

registerBuiltinComponents();
export { registerBuiltinComponents };

export * from "./viewer";

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
export type { DecomposeModelOptions } from "./tools/prefabeditor/modelPrefab";

export type { FieldDefinition, FieldType } from "./tools/prefabeditor/components/Input";
export { MaterialOverridesProvider, useMaterialOverrides } from "./tools/prefabeditor/components/MaterialComponent";
export type { MaterialOverrides } from "./tools/prefabeditor/components/MaterialComponent";

export {
  float,
  positionLocal,
  sin,
  time,
  uniform,
  vec3,
} from "three/tsl";

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
