import { Component, FieldRenderer, FieldDefinition } from "react-three-game";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group } from "three";

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

// The view component for Rotator
function RotatorView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const groupRef = useRef<Group>(null);
    const speed = properties.speed ?? 1.0;
    const axis = properties.axis ?? 'y';

    useFrame((state, delta) => {
        if (groupRef.current) {
            if (axis === 'x') {
                groupRef.current.rotation.x += delta * speed;
            } else if (axis === 'y') {
                groupRef.current.rotation.y += delta * speed;
            } else if (axis === 'z') {
                groupRef.current.rotation.z += delta * speed;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {children}
        </group>
    );
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
