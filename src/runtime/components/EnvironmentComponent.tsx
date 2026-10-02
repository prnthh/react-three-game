import { Environment } from '@react-three/drei';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

export type EnvironmentProperties = {
    intensity?: number;
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
    const { intensity, ...props } = properties;
    return <Environment {...props} environmentIntensity={intensity} frames={1}>
        <>{children}</>
    </Environment>;
}

const EnvironmentComponent: Component<EnvironmentProperties> = {
    renderWhenDisabled: true,
    name: 'Environment',
    slot: 'environment',
    View: EnvironmentView,
    properties: {
        intensity: { default: 1, min: 0, step: 0.1 },
        resolution: { default: 256, min: 64, step: 64 },
        background: { type: 'boolean', default: true },
        backgroundIntensity: { default: 1, min: 0, step: 0.1 },
        backgroundBlurriness: { default: 0, min: 0, max: 1, step: 0.05 },
        environmentRotation: { type: 'vector3', default: [0, 0, 0] },
        backgroundRotation: { type: 'vector3', default: [0, 0, 0] },
    },
};

export default EnvironmentComponent;
