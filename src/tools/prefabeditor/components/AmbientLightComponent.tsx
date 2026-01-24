import { Component } from "./ComponentRegistry";
import { FieldRenderer, FieldDefinition } from "./Input";

const ambientLightFields: FieldDefinition[] = [
    { name: 'color', type: 'color', label: 'Color' },
    { name: 'intensity', type: 'number', label: 'Intensity', step: 0.1, min: 0 },
];

function AmbientLightComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    return (
        <FieldRenderer
            fields={ambientLightFields}
            values={component.properties}
            onChange={onUpdate}
        />
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
