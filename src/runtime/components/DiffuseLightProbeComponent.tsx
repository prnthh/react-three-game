import { useMemo } from 'react';
import { Color, SphericalHarmonics3, Vector3 } from 'three';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface DiffuseLightProbeProperties {
    intensity: number;
    skyColor: string;
    groundColor: string;
    directionality: number;
    axis: [number, number, number];
}

/** Integrate an authored hemispherical radiance field into diffuse SH coefficients. */
export function createDiffuseProbeSH(p: DiffuseLightProbeProperties) {
    const sh = new SphericalHarmonics3(), direction = new Vector3(), axis = new Vector3(...p.axis).normalize();
    const basis = new Array<number>(9).fill(0), sky = new Color(p.skyColor), ground = new Color(p.groundColor);
    const radiance = new Color(), sample = new Vector3(), samples = 256;
    for (let i = 0; i < samples; i++) {
        const y = 1 - 2 * (i + 0.5) / samples, radius = Math.sqrt(1 - y * y);
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        direction.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        SphericalHarmonics3.getBasisAt(direction, basis);
        radiance.copy(ground).lerp(sky, Math.max(0, y));
        radiance.multiplyScalar(1 - p.directionality + p.directionality * Math.abs(direction.dot(axis)));
        sample.set(radiance.r, radiance.g, radiance.b);
        for (let c = 0; c < 9; c++) sh.coefficients[c].addScaledVector(sample, basis[c] * 4 * Math.PI / samples);
    }
    return sh;
}
function DiffuseProbeView({ properties: p, children }: ComponentViewProps<DiffuseLightProbeProperties>) {
    const [x, y, z] = p.axis;
    const sh = useMemo(() => createDiffuseProbeSH(p),
        [p.skyColor, p.groundColor, p.directionality, x, y, z]);
    return <><lightProbe sh={sh} intensity={p.intensity} />{children}</>;
}
const DiffuseLightProbeComponent: Component<DiffuseLightProbeProperties> = {
    name: 'DiffuseLightProbe', category: 'lighting', View: DiffuseProbeView,
    description: 'Scene-wide static diffuse spherical-harmonic lighting from sky and ground colors. Complements Environment reflections; this is not a local baked probe volume.',
    properties: {
        intensity: { default: 0.35, min: 0, step: 0.05 },
        skyColor: { type: 'color', default: '#a8bfc9' },
        groundColor: { type: 'color', default: '#62615b' },
        directionality: { description: '0 is hemispherical; 1 limits radiance along the world-space axis (useful for canyons).', default: 0, min: 0, max: 1, step: 0.05 },
        axis: { description: 'World-space direction of the opening; normalized during sampling.', type: 'vector3', default: [0, 0, 1] },
    },
};
export default DiffuseLightProbeComponent;
