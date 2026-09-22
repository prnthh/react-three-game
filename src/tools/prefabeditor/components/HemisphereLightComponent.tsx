import type { Component, ComponentViewProps } from "./ComponentRegistry";

import { mergeWithDefaults } from "./lightUtils";

export const hemisphereLightDefaults = {
    skyColor: "#ffffff",
    groundColor: "#444444",
    intensity: 1,
};

export type HemisphereLightProperties = Partial<typeof hemisphereLightDefaults>;

function HemisphereLightView({ properties, children }: ComponentViewProps<HemisphereLightProperties>) {
    const { skyColor, groundColor, intensity } = mergeWithDefaults(hemisphereLightDefaults, properties);
    return <>
        <hemisphereLight args={[skyColor, groundColor, intensity]} />
        {children}
    </>;
}

const HemisphereLightComponent: Component<HemisphereLightProperties> = {
    name: "HemisphereLight",
    slot: "object",
    renderWhenDisabled: true,
    View: HemisphereLightView,
    properties: {
        skyColor: { type: "color", default: hemisphereLightDefaults.skyColor },
        groundColor: { type: "color", default: hemisphereLightDefaults.groundColor },
        intensity: { default: hemisphereLightDefaults.intensity, min: 0, step: 0.1 },
    },
};

export default HemisphereLightComponent;
