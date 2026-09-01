import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { ColorField, NumberField } from "./Input";
import { LightSection, mergeWithDefaults } from "./lightUtils";

const hemisphereLightDefaults = {
    skyColor: "#ffffff",
    groundColor: "#444444",
    intensity: 1,
};

type HemisphereLightProperties = Partial<typeof hemisphereLightDefaults>;

function HemisphereLightEditor({ properties, update }: ComponentEditorProps<HemisphereLightProperties>) {
    const values = mergeWithDefaults(hemisphereLightDefaults, properties);
    return <LightSection title="Light">
        <ColorField name="skyColor" label="Sky Color" values={values} onChange={update} />
        <ColorField name="groundColor" label="Ground Color" values={values} onChange={update} />
        <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
    </LightSection>;
}

function HemisphereLightView({ properties, children }: ComponentViewProps<HemisphereLightProperties>) {
    const { skyColor, groundColor, intensity } = mergeWithDefaults(hemisphereLightDefaults, properties);
    return <>
        <hemisphereLight args={[skyColor, groundColor, intensity]} />
        {children}
    </>;
}

const HemisphereLightComponent: Component<HemisphereLightProperties> = {
    name: "HemisphereLight",
    renderWhenDisabled: true,
    Editor: HemisphereLightEditor,
    View: HemisphereLightView,
    properties: {
        skyColor: { type: "color", default: hemisphereLightDefaults.skyColor },
        groundColor: { type: "color", default: hemisphereLightDefaults.groundColor },
        intensity: { default: hemisphereLightDefaults.intensity, min: 0, step: 0.1 },
    },
};

export default HemisphereLightComponent;
