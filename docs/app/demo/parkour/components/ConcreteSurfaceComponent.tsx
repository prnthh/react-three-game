import { bumpMap, float, reference, mix, mx_noise_float, positionWorld, vec3 } from 'three/tsl';
import { useMemo } from 'react';
import { MaterialOverridesProvider, type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Properties = { weathering: number; scale: number };
// Share the graph, reading values from the source mesh even during shadow override passes.
const weathering = reference('material.userData.weathering', 'float', null);
const p = positionWorld.mul(reference('material.userData.scale', 'float', null));
const broad = mx_noise_float(p.mul(0.45)).mul(0.5).add(0.5);
const grain = mx_noise_float(p.mul(28)).mul(0.5).add(0.5);
const streak = mx_noise_float(p.mul(vec3(3, 0.16, 3))).mul(0.5).add(0.5);
const shade = broad.mul(0.4).add(streak.mul(0.25)).add(grain.mul(0.12)).add(0.42);
const colorNode = reference('material.color', 'color', null).mul(mix(float(1), shade, weathering));
// Keep the pores shallow so grazing light does not make the concrete look hammered.
const normalNode = bumpMap(mx_noise_float(p.mul(18)).mul(0.005).add(mx_noise_float(p.mul(2)).mul(0.012)).mul(weathering));

export function createConcreteSurfaceOverrides(properties: Properties) {
    return {
        userData: { weathering: properties.weathering, scale: properties.scale },
        colorNode, normalNode,
    };
}

function ConcreteSurfaceView({ properties, children }: ComponentViewProps<Properties>) {
    const overrides = useMemo(() => createConcreteSurfaceOverrides(properties), [properties.weathering, properties.scale]);
    return <MaterialOverridesProvider overrides={overrides} cacheKey={`concrete:${properties.weathering}:${properties.scale}`}>
        {children}
    </MaterialOverridesProvider>;
}
export const ConcreteSurfaceComponent: Component<Properties> = {
    name: 'ConcreteSurface', category: 'materials', exclusive: 'concrete-surface', renderWhenDisabled: true,
    description: 'Apply procedural concrete mottling and pores to this node’s Material. Color, roughness and named sharing remain ordinary Material settings.',
    properties: {
        weathering: { default: 1, min: 0, max: 2, step: 0.1 },
        scale: { default: 1, min: 0.1, max: 10, step: 0.1 },
    },
    View: ConcreteSurfaceView,
};
