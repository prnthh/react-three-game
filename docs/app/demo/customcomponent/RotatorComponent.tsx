import { Component, FieldRenderer, FieldDefinition, useEntityObjectRef, useEntityRuntime } from "react-three-game";
import { useFrame } from "@react-three/fiber";

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

// The view component for Rotator mutates its own live Object3D via node-local runtime hooks.
function RotatorView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const { editMode } = useEntityRuntime();
    const objectRef = useEntityObjectRef();
    const speed = properties.speed ?? 1.0;
    const axis = properties.axis ?? 'y';

    useFrame((_, delta) => {
        if (editMode) return;
        const obj = objectRef.current;
        if (obj) {
            obj.rotation[axis as 'x' | 'y' | 'z'] += delta * speed;
        }
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
