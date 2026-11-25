import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";


export const hemisphereLightDefaults = {
    skyColor: "#ffffff",
    groundColor: "#444444",
    intensity: 1,
};

export type HemisphereLightProperties = Partial<typeof hemisphereLightDefaults>;

function HemisphereLightView({ properties }: ComponentViewProps<HemisphereLightProperties>) {
    const { skyColor, groundColor, intensity } = properties;
    return <hemisphereLight color={skyColor} groundColor={groundColor} intensity={intensity} />;
}

const HemisphereLightComponent: Component<HemisphereLightProperties> = {
    name: "HemisphereLight",
    slot: 'leaf',
    renderWhenDisabled: true,
    description: "Add sky/ground fill lighting using skyColor, groundColor and intensity. This light does not cast shadows.",
    category: 'lighting',
    View: HemisphereLightView,
    properties: {
        skyColor: { type: "color", default: hemisphereLightDefaults.skyColor },
        groundColor: { type: "color", default: hemisphereLightDefaults.groundColor },
        intensity: { default: hemisphereLightDefaults.intensity, min: 0, step: 0.1 },
    },
};

export default HemisphereLightComponent;
