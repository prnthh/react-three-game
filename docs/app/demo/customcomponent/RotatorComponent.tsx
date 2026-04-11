import { Component, FieldRenderer, FieldDefinition, useSceneRuntime } from "react-three-game";
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

// The view component for Rotator — uses RefBridge for direct Object3D mutation (no wrapper group)
function RotatorView({ properties, children, nodeId }: { properties: any; children?: React.ReactNode; nodeId?: string }) {
    const { refBridge, editMode } = useSceneRuntime();
    const speed = properties.speed ?? 1.0;
    const axis = properties.axis ?? 'y';

    useFrame((_, delta) => {
        if (editMode || !nodeId) return;
        const obj = refBridge.get(nodeId);
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
