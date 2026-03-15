import { Component } from "./ComponentRegistry";
import { ColorField, FieldGroup, NumberField } from "./Input";

function AmbientLightComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    return (
        <FieldGroup>
            <ColorField name="color" label="Color" values={component.properties} onChange={onUpdate} />
            <NumberField name="intensity" label="Intensity" values={component.properties} onChange={onUpdate} min={0} step={0.1} fallback={1} />
        </FieldGroup>
    );
}

function AmbientLightComponentView({ properties }: { properties: any }) {
    const { color = '#ffffff', intensity = 1 } = properties;
    return <ambientLight color={color} intensity={intensity} />;
}

const AmbientLightComponent: Component = {
    name: 'AmbientLight',
    Editor: AmbientLightComponentEditor,
    View: AmbientLightComponentView,
    defaultProperties: {
        color: '#ffffff',
        intensity: 1,
    },
};

export default AmbientLightComponent;
