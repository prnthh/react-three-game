import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, StringField } from './Input';

export type MeshProperties = {
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    emitClickEvent?: boolean;
    clickEventName?: string;
};

function MeshEditor({ properties, update }: ComponentEditorProps<MeshProperties>) {
    return <FieldGroup>
        <BooleanField name="visible" label="Visible" values={properties} onChange={update} fallback />
        <BooleanField name="castShadow" label="Cast Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="receiveShadow" label="Receive Shadow" values={properties} onChange={update} fallback />
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

function MeshView({ properties, children }: ComponentViewProps<MeshProperties>) {
    const visible = properties.visible !== false;
    return (
        <mesh
            visible={visible}
            castShadow={visible && properties.castShadow !== false}
            receiveShadow={visible && properties.receiveShadow !== false}
        >
            {children}
        </mesh>
    );
}

const MeshComponent: Component<MeshProperties> = {
    name: 'Mesh',
    disableSiblingComposition: 'object',
    Editor: MeshEditor,
    View: MeshView,
    defaultProperties: {
        visible: true,
        castShadow: true,
        receiveShadow: true,
        emitClickEvent: false,
        clickEventName: '',
    },
};

export default MeshComponent;
