import { AssetBoundary } from '../assets/AssetBoundary';
import { Environment } from '@react-three/drei';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

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
    slot: 'environment',
    View: EnvironmentView,
    properties: {
        intensity: { default: 1, min: 0, step: 0.1 },
        frames: { default: 1, min: 0, step: 1, description: "Capture count. 0 captures on every R3F frame; 1 captures once per children update." },
        resolution: { default: 256, min: 64, step: 64 },
        background: { type: 'boolean', default: true },
        backgroundIntensity: { default: 1, min: 0, step: 0.1 },
        backgroundBlurriness: { default: 0, min: 0, max: 1, step: 0.05 },
        environmentRotation: { type: 'vector3', default: [0, 0, 0] },
        backgroundRotation: { type: 'vector3', default: [0, 0, 0] },
    },
};

export default EnvironmentComponent;
