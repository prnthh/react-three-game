import { Environment } from '@react-three/drei';
import { Component } from './ComponentRegistry';
import { FieldGroup, NumberField } from './Input';
import { Object3D, Texture } from 'three';

function EnvironmentView({
    properties,
    children,
    editMode,
    loadedTextures,
    loadedModels,
}: {
    properties: any;
    children?: React.ReactNode;
    editMode?: boolean;
    loadedTextures?: Record<string, Texture>;
    loadedModels?: Record<string, Object3D>;
}) {
    const { intensity = 1, resolution = 256 } = properties;
    const assetRevision = `${Object.keys(loadedTextures ?? {}).sort().join('|')}::${Object.keys(loadedModels ?? {}).sort().join('|')}`;

    return (
        <Environment
            key={assetRevision}
            background={true}
            environmentIntensity={intensity}
            resolution={resolution}
            frames={editMode ? undefined : 1}
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
