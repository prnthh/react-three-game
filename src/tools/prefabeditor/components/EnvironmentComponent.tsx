import { Environment } from '@react-three/drei';
import type { Component, ComponentViewProps } from './ComponentRegistry';
import { FieldGroup, NumberField } from './Input';
import { useVisualAssetRevision } from '../assetRuntime';

type EnvironmentProperties = {
    intensity?: number;
    resolution?: number;
};

function EnvironmentView({
    properties,
    children,
}: ComponentViewProps<EnvironmentProperties>) {
    const assetRevision = useVisualAssetRevision();
    const { intensity = 1, resolution = 256 } = properties;
    const environmentRevision = `${assetRevision}::${intensity}::${resolution}`;

    return (
        <Environment
            key={environmentRevision}
            background={true}
            environmentIntensity={intensity}
            resolution={resolution}
            frames={1}
        >
            {children}
        </Environment>
    );
}

const EnvironmentComponent: Component<EnvironmentProperties> = {
    name: 'Environment',
    disableSiblingComposition: true,
    Editor: ({ properties, update }) => (
        <FieldGroup>
            <NumberField name="intensity" label="Intensity" values={properties} onChange={update} min={0} step={0.1} fallback={1} />
            <NumberField name="resolution" label="Resolution" values={properties} onChange={update} min={64} step={64} fallback={256} />
        </FieldGroup>
    ),
    View: EnvironmentView,
    properties: {
        intensity: { default: 1, min: 0, step: 0.1 },
        resolution: { default: 256, min: 64, step: 64 },
    },
};

export default EnvironmentComponent;
