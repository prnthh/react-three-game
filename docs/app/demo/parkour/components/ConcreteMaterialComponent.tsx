import { bumpMap, float, reference, mix, mx_noise_float, positionWorld, vec3 } from 'three/tsl';
import { useMemo } from 'react';
import { MaterialComponent, MaterialOverridesProvider, type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Properties = { name?: string; attach?: string; color: string; weathering: number; scale: number; roughness: number };
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

export function createConcreteMaterialOverrides(properties: Pick<Properties, 'color' | 'roughness' | 'weathering' | 'scale'>) {
    return {
        color: properties.color, roughness: properties.roughness, metalness: 0,
        userData: { weathering: properties.weathering, scale: properties.scale },
        colorNode, normalNode,
    };
}

function ConcreteView({ properties, children, enabled }: ComponentViewProps<Properties>) {
    const overrides = useMemo(() => createConcreteMaterialOverrides(properties),
        [properties.color, properties.roughness, properties.weathering, properties.scale]);
    const BaseMaterial = MaterialComponent.View!;
    return <MaterialOverridesProvider overrides={overrides} cacheKey={`concrete:${properties.color}:${properties.roughness}:${properties.weathering}:${properties.scale}`}>
        <BaseMaterial properties={{ name: properties.name, attach: properties.attach }} enabled={enabled}>{children}</BaseMaterial>
    </MaterialOverridesProvider>;
}
export const ConcreteMaterialComponent: Component<Properties> = {
    ...MaterialComponent,
    name: 'ConcreteMaterial',
    description: 'Material variant with procedural concrete mottling and water staining. Uses a regular named Material as its base.',
    properties: {
        name: MaterialComponent.properties.name,
        attach: MaterialComponent.properties.attach,
        color: { type: 'color', default: '#89816a' },
        weathering: { default: 1, min: 0, max: 2, step: 0.1 },
        scale: { default: 1, min: 0.1, max: 10, step: 0.1 },
        roughness: { default: 0.96, min: 0, max: 1, step: 0.05, description: 'Lower for finished faces; higher for raw concrete.' },
    }, View: ConcreteView,
};
