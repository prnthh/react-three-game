import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { ColorField, NumberField } from "./Input";
import { LightSection, mergeWithDefaults } from "./lightUtils";

const ambientLightDefaults = {
    color: '#ffffff',
    intensity: 1,
};

type AmbientLightProperties = Partial<typeof ambientLightDefaults>;

function AmbientLightComponentEditor({ properties, update }: ComponentEditorProps<AmbientLightProperties>) {
    const values = mergeWithDefaults(ambientLightDefaults, properties);

    return (
        <LightSection title="Light">
            <ColorField name="color" label="Color" values={values} onChange={update} />
            <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
        </LightSection>
    );
}

function AmbientLightComponentView({ properties, children }: ComponentViewProps<AmbientLightProperties>) {
    const { color, intensity } = mergeWithDefaults(ambientLightDefaults, properties);

    return (
        <>
            <ambientLight color={color} intensity={intensity} />
            {children}
        </>
    );
}

const AmbientLightComponent: Component<AmbientLightProperties> = {
    name: 'AmbientLight',
    renderWhenDisabled: true,
    Editor: AmbientLightComponentEditor,
    View: AmbientLightComponentView,
    properties: {
        color: { type: 'color', default: ambientLightDefaults.color },
        intensity: { default: ambientLightDefaults.intensity, min: 0, step: 0.1 },
    },
};

export default AmbientLightComponent;
