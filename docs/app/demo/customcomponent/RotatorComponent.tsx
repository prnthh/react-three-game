import { useFrame } from "@react-three/fiber";
import {
    useNodeObject,
    type Component,
    type ComponentViewProps,
} from "react-three-game";
import { FieldRenderer } from "react-three-game/editor";
import type { ComponentEditorProps } from "react-three-game/editor";

type RotationAxis = 'x' | 'y' | 'z';
type RotatorProperties = {
    speed?: number;
    axis?: RotationAxis;
};

function RotatorComponentEditor({ properties, update }: ComponentEditorProps<RotatorProperties>) {
    return (
        <FieldRenderer
            fields={[
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
            ]}
            values={properties}
            onChange={update}
        />
    );
}

function RotatorView({ properties, children }: ComponentViewProps<RotatorProperties>) {
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

const RotatorComponent: Component<RotatorProperties> = {
    name: 'Rotator',
    Editor: RotatorComponentEditor,
    View: RotatorView,
    defaultProperties: {
        speed: 1.0,
        axis: 'y'
    }
};

export default RotatorComponent;
