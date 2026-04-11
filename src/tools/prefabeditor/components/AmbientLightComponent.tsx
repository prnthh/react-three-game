import { Component } from "./ComponentRegistry";
import { ColorField, FieldGroup, NumberField } from "./Input";
import { LightSection, mergeWithDefaults } from "./lightUtils";

const ambientLightDefaults = {
    color: '#ffffff',
    intensity: 1,
};

function AmbientLightComponentEditor({
    component,
    onUpdate,
}: {
    component: any;
    onUpdate: (newProps: any) => void;
}) {
    const values = mergeWithDefaults(ambientLightDefaults, component.properties);

    return (
        <LightSection title="Light">
            <ColorField name="color" label="Color" values={values} onChange={onUpdate} />
            <NumberField name="intensity" label="Intensity" values={values} onChange={onUpdate} min={0} step={0.1} fallback={1} />
        </LightSection>
    );
}

function AmbientLightComponentView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const { color, intensity } = mergeWithDefaults(ambientLightDefaults, properties);

    return (
        <>
            <ambientLight color={color} intensity={intensity} />
            {children}
        </>
    );
}

const AmbientLightComponent: Component = {
    name: 'AmbientLight',
    Editor: AmbientLightComponentEditor,
    View: AmbientLightComponentView,
    defaultProperties: {},
};

export default AmbientLightComponent;
