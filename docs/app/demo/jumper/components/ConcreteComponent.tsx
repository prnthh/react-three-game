import { MeshStandardNodeMaterial } from 'three/webgpu';
import { bumpMap, color, float, mix, mx_noise_float, positionWorld, vec3 } from 'three/tsl';
import { useSharedMaterialResource, type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Properties = { color: string; weathering: number; scale: number; roughness: number };
function ConcreteView({ properties, children }: ComponentViewProps<Properties>) {
    const material = useSharedMaterialResource(`jumper-concrete:${properties.color}:${properties.weathering}:${properties.scale}:${properties.roughness}`, () => {
        const m = new MeshStandardNodeMaterial({ roughness: properties.roughness });
        const p = positionWorld.mul(properties.scale);
        const broad = mx_noise_float(p.mul(0.45)).mul(0.5).add(0.5);
        const grain = mx_noise_float(p.mul(28)).mul(0.5).add(0.5);
        const streak = mx_noise_float(p.mul(vec3(3, 0.16, 3))).mul(0.5).add(0.5);
        const shade = broad.mul(0.4).add(streak.mul(0.25)).add(grain.mul(0.12)).add(0.42);
        m.colorNode = color(properties.color).mul(mix(float(1), shade, float(properties.weathering)));
        m.normalNode = bumpMap(mx_noise_float(p.mul(18)).mul(0.018).add(mx_noise_float(p.mul(2)).mul(0.025)).mul(properties.weathering));
        return m;
    });
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
