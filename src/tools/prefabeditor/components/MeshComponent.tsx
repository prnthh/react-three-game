import { useRef } from 'react';
import type { Mesh } from 'three';
import { useCompileObject } from '../../../shared/GameCanvas';
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
    const ref = useRef<Mesh>(null);
    useCompileObject(ref);
    const visible = properties.visible !== false;
    return (
        <mesh
            ref={ref}
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
    renderWhenDisabled: true,
    disableSiblingComposition: 'object',
    Editor: MeshEditor,
    View: MeshView,
    properties: {
        visible: { type: 'boolean', default: true },
        castShadow: { type: 'boolean', default: true },
        receiveShadow: { type: 'boolean', default: true },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: '' },
    },
};

export default MeshComponent;
