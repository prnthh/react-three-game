import { useFrame } from "@react-three/fiber";
import { Component, FieldRenderer, FieldDefinition, useNodeObject } from "react-three-game";

type RotationAxis = 'x' | 'y' | 'z';
type RotatorProperties = {
    speed?: number;
    axis?: RotationAxis;
};

const rotatorFields: FieldDefinition[] = [
    { name: 'speed', type: 'number', label: 'Rotation Speed', step: 0.1 },
    {
        name: 'axis',
        type: 'select',
        label: 'Rotation Axis',
        options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
        ],
    },
];

function RotatorComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldRenderer
            fields={rotatorFields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

function RotatorView({ properties, children }: { properties: RotatorProperties; children?: React.ReactNode }) {
    const objectRef = useNodeObject();

    useFrame((_, delta) => {
        const object = objectRef.current;
        if (!object) return;

        const speed = properties.speed ?? 1.0;
        const axis = properties.axis ?? 'y';
        object.rotation[axis] += delta * speed;
    });

    return <>{children}</>;
}

const RotatorComponent: Component = {
    name: 'Rotator',
    Editor: RotatorComponentEditor,
    View: RotatorView,
    defaultProperties: {
        speed: 1.0,
        axis: 'y'
    }
};

export default RotatorComponent;
