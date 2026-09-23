import { useFrame } from "@react-three/fiber";

import { useNode, useGameObject, type Component, type ComponentViewProps } from "react-three-game/viewer";

export type RotationAxis = 'x' | 'y' | 'z';

export type RotatorProperties = {
    speed?: number;
    axis?: RotationAxis;
};

function RotatorView({ properties, children }: ComponentViewProps<RotatorProperties>) {
    const { editMode } = useNode();
    const objectRef = useGameObject();

    useFrame((_, delta) => {
        const object = objectRef.transform;
        if (editMode || !object) return;

        const speed = properties.speed;
        const axis = properties.axis;
        object.rotation[axis] += delta * speed;
    });

    return <>{children}</>;
}

const RotatorComponent: Component<RotatorProperties> = {
    name: 'Rotator',
    View: RotatorView,
    properties: {
        speed: { default: 1, label: "Rotation Speed", step: 0.1 },
        axis: {
            type: 'select',
            label: 'Rotation Axis',
            default: 'y',
            options: [
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y' },
                { value: 'z', label: 'Z' },
            ],
        },
    }
};

export default RotatorComponent;
