import { useEffect, useLayoutEffect, useMemo } from 'react';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface SkyProperties {
    sunPosition: [number, number, number];
    size: number;
    turbidity: number;
    rayleigh: number;
    mieCoefficient: number;
    mieDirectionalG: number;
    sunDisc: boolean;
}

function SkyView({ properties: p, children }: ComponentViewProps<SkyProperties>) {
    const sky = useMemo(() => new SkyMesh(), []);
    useLayoutEffect(() => {
        sky.scale.setScalar(p.size);
        sky.sunPosition.value.fromArray(p.sunPosition);
        sky.turbidity.value = p.turbidity;
        sky.rayleigh.value = p.rayleigh;
        sky.mieCoefficient.value = p.mieCoefficient;
        sky.mieDirectionalG.value = p.mieDirectionalG;
        sky.showSunDisc.value = p.sunDisc ? 1 : 0;
        // Uniform edits do not change material.version; signal capture invalidation
        // without recompiling the sky shader or continuously recapturing the world.
        sky.userData.environmentVersion = (sky.userData.environmentVersion ?? 0) + 1;
    }, [sky, p.sunPosition[0], p.sunPosition[1], p.sunPosition[2], p.size, p.turbidity, p.rayleigh, p.mieCoefficient, p.mieDirectionalG, p.sunDisc]);
    useEffect(() => () => { sky.geometry.dispose(); sky.material.dispose(); }, [sky]);
    return <><primitive object={sky} />{children}</>;
}

const SkyComponent: Component<SkyProperties> = {
    name: 'Sky', category: 'lighting', View: SkyView,
    description: 'Procedural atmospheric sky. Place beneath Environment to capture it for background and reflections. Sun position does not create a directional light.',
    properties: {
        sunPosition: { type: 'vector3', default: [0, 100, 100] },
        size: { default: 450, min: 1 },
        turbidity: { default: 8, min: 0, max: 20, step: 0.1 },
        rayleigh: { default: 1.2, min: 0, max: 4, step: 0.1 },
        mieCoefficient: { default: 0.005, min: 0, max: 0.1, step: 0.001 },
        mieDirectionalG: { default: 0.8, min: 0, max: 0.999, step: 0.01 },
        sunDisc: { type: 'boolean', default: false },
    },
};
export default SkyComponent;
