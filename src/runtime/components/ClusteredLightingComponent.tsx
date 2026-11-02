import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';
// @ts-expect-error Three's clustered-lighting addon has no published declaration yet.
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { disposeAfterPrefabCompilation } from '../rendering/compileInSlices.js';

type Properties = { maxLights: number; tileSize: number; zSlices: number; maxLightsPerCluster: number };
function ClusteredLightingView({ properties: p, children }: ComponentViewProps<Properties>) {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    useLayoutEffect(() => {
        const previous = renderer.lighting;
        const integer = (value: number) => Math.max(1, Math.round(value));
        const lighting = new ClusteredLighting(integer(p.maxLights), integer(p.tileSize), integer(p.zSlices), integer(p.maxLightsPerCluster));
        renderer.lighting = lighting;
        return () => {
            if (renderer.lighting === lighting) renderer.lighting = previous;
            disposeAfterPrefabCompilation(renderer, () => lighting.dispose());
        };
    }, [renderer, p.maxLights, p.tileSize, p.zSlices, p.maxLightsPerCluster]);
    return children;
}
const ClusteredLightingComponent: Component<Properties> = {
    name: 'ClusteredLighting', scope: 'scene', exclusive: 'lighting-system', category: 'lighting',
    description: 'Scene-root clustered lighting for many point and spot lights. Applies in Edit and Play; removal restores the renderer lighting system. Omit to use standard Three.js lighting.',
    View: ClusteredLightingView,
    properties: {
        maxLights: { default: 1024, min: 1, step: 1 },
        tileSize: { default: 32, min: 1, step: 1 },
        zSlices: { default: 24, min: 1, step: 1 },
        maxLightsPerCluster: { default: 64, min: 1, step: 1 },
    },
};
export default ClusteredLightingComponent;
