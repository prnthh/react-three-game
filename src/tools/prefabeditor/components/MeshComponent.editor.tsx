import type { ComponentEditorProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, StringField } from './Input';
import { MeshProperties } from "./MeshComponent";

function MeshEditor({ properties, update }: ComponentEditorProps<MeshProperties>) {
    return <FieldGroup>
        <BooleanField name="visible" label="Visible" values={properties} onChange={update} fallback />
        <BooleanField name="castShadow" label="Cast Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="receiveShadow" label="Receive Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="instanced" label="Allow Instancing" values={properties} onChange={update} fallback />
        <BooleanField name="emitClickEvent" label="Emit Click Event" values={properties} onChange={update} fallback={false} />
        {properties.emitClickEvent ? (
            <StringField
                name="clickEventName"
                label="Click Event Name"
                values={properties}
                onChange={update}
                placeholder="node:click"
            />
        ) : null}
    </FieldGroup>;
}

export default MeshEditor;
