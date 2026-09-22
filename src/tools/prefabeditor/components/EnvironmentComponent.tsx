import { Environment } from '@react-three/drei';

import { useVisualAssetRevision } from '../assetRuntime';

import type { Component, ComponentViewProps } from './ComponentRegistry';

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
    const assetRevision = useVisualAssetRevision();
    const {
        intensity = 1,
        resolution = 256,
        background = true,
        backgroundIntensity = 1,
        backgroundBlurriness = 0,
        environmentRotation = [0, 0, 0],
        backgroundRotation = [0, 0, 0],
    } = properties;
    const environmentRevision = [
        assetRevision,
        intensity,
        resolution,
        background,
        backgroundIntensity,
        backgroundBlurriness,
        ...environmentRotation,
        ...backgroundRotation,
    ].join('::');

    return (
        <Environment
            key={environmentRevision}
            background={background}
            environmentIntensity={intensity}
            backgroundIntensity={backgroundIntensity}
            backgroundBlurriness={backgroundBlurriness}
            environmentRotation={environmentRotation}
            backgroundRotation={backgroundRotation}
            resolution={resolution}
            frames={1}
        >
            {children}
        </Environment>
    );
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
