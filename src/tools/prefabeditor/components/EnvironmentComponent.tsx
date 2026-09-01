import { Environment } from '@react-three/drei';
import { useVisualAssetRevision } from '../assetRuntime';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, NumberField, Vector3Field } from './Input';

type EnvironmentProperties = {
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
    name: 'Environment',
    attach: 'environment',
    Editor: ({ properties, update }) => <FieldGroup>
        <NumberField name="intensity" label="Intensity" values={properties} onChange={update} min={0} step={0.1} fallback={1} />
        <NumberField name="resolution" label="Resolution" values={properties} onChange={update} min={64} step={64} fallback={256} />
        <BooleanField name="background" label="Use As Background" values={properties} onChange={update} fallback={true} />
        <NumberField name="backgroundIntensity" label="Background Intensity" values={properties} onChange={update} min={0} step={0.1} fallback={1} />
        <NumberField name="backgroundBlurriness" label="Background Blur" values={properties} onChange={update} min={0} max={1} step={0.05} fallback={0} />
        <Vector3Field name="environmentRotation" label="Lighting Rotation" values={properties} onChange={update} fallback={[0, 0, 0]} snap={0.1} />
        <Vector3Field name="backgroundRotation" label="Background Rotation" values={properties} onChange={update} fallback={[0, 0, 0]} snap={0.1} />
    </FieldGroup>,
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
