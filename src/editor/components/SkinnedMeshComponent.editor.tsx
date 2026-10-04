import MeshFields from "./MeshFields.js";
import { useEditorRef } from '../EditorContext.js';
import type { ComponentEditorProps } from '../../core/ComponentRegistry.js';
import { BooleanField, FieldGroup, NumberField, StringField } from '../ui/Input.js';
import { ModelPicker } from '../assets/AssetBrowser.js';
import { SkinnedMeshProperties } from "../../runtime/components/SkinnedMeshComponent.js";

function SkinnedMeshEditor({ node, properties, update }: ComponentEditorProps<SkinnedMeshProperties>) {
    const { basePath } = useEditorRef();
    return <FieldGroup>
        <ModelPicker value={properties.filename} onChange={filename => update({ filename })} basePath={basePath} pickerKey={node.id} />
        <StringField name="animationState" label="Animation State" values={properties} onChange={update} />
        <NumberField name="fadeDuration" label="Fade Duration" values={properties} onChange={update} fallback={0.18} min={0} step={0.05} />
        <BooleanField name="autoUpdate" label="Auto Update" values={properties} onChange={update} fallback />
        <MeshFields properties={properties} update={update} instancing={false} frustumCulledDefault={false} />
    </FieldGroup>;
}

export default SkinnedMeshEditor;
