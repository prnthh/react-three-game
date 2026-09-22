import { useEditorRef } from '../EditorContext';
import type { ComponentEditorProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, NumberField, StringField } from './Input';
import { ModelPicker } from '../../assetviewer/page';
import { AnimatedModelProperties } from "./AnimatedModelComponent";

function AnimatedModelEditor({ node, properties, update }: ComponentEditorProps<AnimatedModelProperties>) {
    const { basePath } = useEditorRef();
    return <FieldGroup>
        <ModelPicker value={properties.filename} onChange={filename => update({ filename })} basePath={basePath} pickerKey={node.id} />
        <StringField name="animationState" label="Animation State" values={properties} onChange={update} />
        <NumberField name="fadeDuration" label="Fade Duration" values={properties} onChange={update} fallback={0.18} min={0} step={0.05} />
        <BooleanField name="castShadow" label="Cast Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="receiveShadow" label="Receive Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="frustumCulled" label="Frustum Culling" values={properties} onChange={update} fallback={false} />
        <BooleanField name="autoUpdate" label="Auto Update" values={properties} onChange={update} fallback />
        <BooleanField name="emitClickEvent" label="Emit Click Event" values={properties} onChange={update} fallback={false} />
        {properties.emitClickEvent ? (
            <StringField name="clickEventName" label="Click Event Name" values={properties} onChange={update} placeholder="node:click" />
        ) : null}
    </FieldGroup>;
}

export default AnimatedModelEditor;
