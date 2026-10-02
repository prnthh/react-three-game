import { MeshStandardNodeMaterial } from 'three/webgpu';
import { bumpMap, float, reference, mix, mx_noise_float, positionWorld, vec3 } from 'three/tsl';
import { useSharedMaterialResource, type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Properties = { color: string; weathering: number; scale: number; roughness: number };
// Share the graph, reading values from the source mesh even during shadow override passes.
const weathering = reference('material.userData.weathering', 'float', null);
const p = positionWorld.mul(reference('material.userData.scale', 'float', null));
const broad = mx_noise_float(p.mul(0.45)).mul(0.5).add(0.5);
const grain = mx_noise_float(p.mul(28)).mul(0.5).add(0.5);
const streak = mx_noise_float(p.mul(vec3(3, 0.16, 3))).mul(0.5).add(0.5);
const shade = broad.mul(0.4).add(streak.mul(0.25)).add(grain.mul(0.12)).add(0.42);
const colorNode = reference('material.color', 'color', null).mul(mix(float(1), shade, weathering));
const normalNode = bumpMap(mx_noise_float(p.mul(18)).mul(0.018).add(mx_noise_float(p.mul(2)).mul(0.025)).mul(weathering));

export function createConcreteMaterial(properties: Properties) {
    const material = new MeshStandardNodeMaterial({ color: properties.color, roughness: properties.roughness });
    material.userData.weathering = properties.weathering;
    material.userData.scale = properties.scale;
    material.colorNode = colorNode;
    material.normalNode = normalNode;
    return material;
}

function ConcreteView({ properties, children }: ComponentViewProps<Properties>) {
    const material = useSharedMaterialResource(
        `jumper-concrete:${properties.color}:${properties.weathering}:${properties.scale}:${properties.roughness}`,
        () => createConcreteMaterial(properties),
    );
    return <><primitive object={material} attach="material" />{children}</>;
}
export const ConcreteComponent: Component<Properties> = {
    name: 'JumperConcrete', slot: 'material', renderWhenDisabled: true,
    description: 'World-space mottled concrete and vertical water staining. No texture downloads.',
    properties: {
        color: { type: 'color', default: '#89816a' },
        weathering: { default: 1, min: 0, max: 2, step: 0.1 },
        scale: { default: 1, min: 0.1, max: 10, step: 0.1 },
        roughness: { default: 0.96, min: 0, max: 1, step: 0.05, description: 'Lower for finished faces; higher for raw concrete.' },
    }, View: ConcreteView,
};
