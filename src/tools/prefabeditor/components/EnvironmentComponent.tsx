import { Environment } from '@react-three/drei';
import { Component } from './ComponentRegistry';
import { FieldGroup, NumberField } from './Input';
import { useAssetRuntime } from '../assetRuntime';

function EnvironmentView({
    properties,
    children,
}: {
    properties: any;
    children?: React.ReactNode;
}) {
    const { getAssetRevision } = useAssetRuntime();
    const { intensity = 1, resolution = 256 } = properties;
    const environmentRevision = `${getAssetRevision()}::${intensity}::${resolution}`;

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

const EnvironmentComponent: Component = {
    name: 'Environment',
    Editor: ({ component, onUpdate }) => (
        <FieldGroup>
            <NumberField name="intensity" label="Intensity" values={component.properties} onChange={onUpdate} min={0} step={0.1} fallback={1} />
            <NumberField name="resolution" label="Resolution" values={component.properties} onChange={onUpdate} min={64} step={64} fallback={256} />
        </FieldGroup>
    ),
    View: EnvironmentView,
    defaultProperties: {},
};

export default EnvironmentComponent;
