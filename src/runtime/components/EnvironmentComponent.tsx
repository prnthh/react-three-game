import { AssetBoundary } from '../assets/AssetBoundary.js';
import { Environment } from '@react-three/drei';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export type EnvironmentProperties = {
    intensity?: number;
    /** Capture count. Zero means continuous capture on the R3F render loop. */
    frames?: number;
    resolution?: number;
    background?: boolean;
    backgroundIntensity?: number;
    backgroundBlurriness?: number;
    environmentRotation?: [number, number, number];
    backgroundRotation?: [number, number, number];
};

function EnvironmentView({
    properties,
    children,
}: ComponentViewProps<EnvironmentProperties>) {
    const store = usePrefabStoreApi();
    const { intensity, frames = 1, ...props } = properties;
    return <AssetBoundary atomic subscribeToRetry={store.subscribe}><Environment {...props} environmentIntensity={intensity} frames={frames === 0 ? Infinity : frames}>
        <>{children}</>
    </Environment></AssetBoundary>;
}

const EnvironmentComponent: Component<EnvironmentProperties> = {
    renderWhenDisabled: true,
    name: 'Environment',
    description: "Capture child objects as the scene lighting/reflection environment. For an image, add a child sphere with a basic BackSide image material. background also displays the captured map.",
    slot: 'environment',
    View: EnvironmentView,
    properties: {
        intensity: { default: 1, min: 0, step: 0.1 },
        frames: { default: 1, min: 0, step: 1, description: "Capture count. 0 captures on every R3F frame; 1 captures once per children update." },
        resolution: { description: "Cube-map face resolution in pixels.", default: 256, min: 64, step: 64 },
        background: { type: 'boolean', default: true },
        backgroundIntensity: { default: 1, min: 0, step: 0.1 },
        backgroundBlurriness: { default: 0, min: 0, max: 1, step: 0.05 },
        environmentRotation: { description: "XYZ Euler radians rotating the lighting/reflection map.", type: 'vector3', default: [0, 0, 0] },
        backgroundRotation: { description: "XYZ Euler radians rotating the visible background map.", type: 'vector3', default: [0, 0, 0] },
    },
};

export default EnvironmentComponent;
