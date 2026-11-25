import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Lighting, type WebGPURenderer } from 'three/webgpu';
// @ts-expect-error Three's clustered-lighting addon has no published declaration yet.
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import type { Component } from '../../core/ComponentRegistry.js';
import { disposeAfterPrefabCompilation } from '../rendering/compileInSlices.js';

type Properties = { maxLights: number; tileSize: number; zSlices: number; maxLightsPerCluster: number };
// Several prefab roots can share an R3F renderer and unmount in any order.
type OwnedLighting = Lighting & { dispose(): void };
type LightingOwners = { host: Lighting; defaults: number; fallback?: OwnedLighting; overrides: OwnedLighting[] };
const owners = new WeakMap<WebGPURenderer, LightingOwners>();

export function SceneClusteredLighting({ properties, children }: { properties?: Properties; children?: React.ReactNode }) {
    const { maxLights, tileSize, zSlices, maxLightsPerCluster } = properties ?? {};
    const implicit = properties === undefined;
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    useLayoutEffect(() => {
        let state = owners.get(renderer);
        if (!state) {
            if (implicit && renderer.lighting?.constructor !== Lighting) return;
            state = { host: renderer.lighting, defaults: 0, overrides: [] };
            owners.set(renderer, state);
        }
        const active = () => state.overrides.at(-1) ?? state.fallback ?? state.host;
        const previous = active();
        const integer = (value?: number) => value === undefined ? undefined : Math.max(1, Math.round(value));
        let override: OwnedLighting | undefined;
        if (implicit) {
            state.defaults++;
            if (state.host?.constructor === Lighting) state.fallback ??= new ClusteredLighting();
        } else {
            override = new ClusteredLighting(integer(maxLights), integer(tileSize), integer(zSlices), integer(maxLightsPerCluster)) as OwnedLighting;
            state.overrides.push(override);
        }
        if (renderer.lighting === previous) renderer.lighting = active();
        return () => {
            const previous = active();
            let retired = override;
            if (override) state.overrides.splice(state.overrides.indexOf(override), 1);
            else if (--state.defaults === 0) {
                retired = state.fallback;
                state.fallback = undefined;
            }
            if (renderer.lighting === previous) renderer.lighting = active();
            if (retired) disposeAfterPrefabCompilation(renderer, () => retired.dispose());
            if (!state.defaults && !state.overrides.length) owners.delete(renderer);
        };
    }, [renderer, implicit, maxLights, tileSize, zSlices, maxLightsPerCluster]);
    return children;
}
const ClusteredLightingComponent: Component<Properties> = {
    name: 'ClusteredLighting', scope: 'scene', exclusive: 'lighting-system', category: 'lighting',
    description: 'Scene-root clustered lighting for many point and spot lights. Applies in Edit and Play; removal restores the renderer lighting system.',
    View: SceneClusteredLighting,
    properties: {
        maxLights: { default: 1024, min: 1, step: 1 },
        tileSize: { default: 32, min: 1, step: 1 },
        zSlices: { default: 24, min: 1, step: 1 },
        maxLightsPerCluster: { default: 64, min: 1, step: 1 },
    },
};
export default ClusteredLightingComponent;
