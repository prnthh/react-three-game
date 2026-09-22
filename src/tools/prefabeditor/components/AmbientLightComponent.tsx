import type { Component, ComponentViewProps } from "./ComponentRegistry";


export const ambientLightDefaults = {
    color: '#ffffff',
    intensity: 1,
};

export type AmbientLightProperties = Partial<typeof ambientLightDefaults>;

function AmbientLightComponentView({ properties, children }: ComponentViewProps<AmbientLightProperties>) {
    const { color, intensity } = properties;

    return (
        <>
            <ambientLight color={color} intensity={intensity} />
            {children}
        </>
    );
}

const AmbientLightComponent: Component<AmbientLightProperties> = {
    name: 'AmbientLight',
    slot: 'object',
    renderWhenDisabled: true,
    View: AmbientLightComponentView,
    properties: {
        color: { type: 'color', default: ambientLightDefaults.color },
        intensity: { default: ambientLightDefaults.intensity, min: 0, step: 0.1 },
    },
};

export default AmbientLightComponent;
