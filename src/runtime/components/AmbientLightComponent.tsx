import { Color } from 'three';
import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";


export const ambientLightDefaults = {
    color: '#ffffff',
    intensity: 1,
};

export type AmbientLightProperties = Partial<typeof ambientLightDefaults>;

function AmbientLightComponentView({ properties, children }: ComponentViewProps<AmbientLightProperties>) {
    const { color, intensity } = properties;

    return (
        <>
            <ambientLight color={new Color(color)} intensity={intensity} />
            {children}
        </>
    );
}

const AmbientLightComponent: Component<AmbientLightProperties> = {
    name: 'AmbientLight',
    category: 'lighting',
    slot: 'object',
    renderWhenDisabled: true,
    View: AmbientLightComponentView,
    properties: {
        color: { type: 'color', default: ambientLightDefaults.color },
        intensity: { default: ambientLightDefaults.intensity, min: 0, step: 0.1 },
    },
};

export default AmbientLightComponent;
