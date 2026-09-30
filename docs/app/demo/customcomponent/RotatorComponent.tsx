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
    const { axis, speed } = properties;
    const color = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' }[axis];
    const plane: [number, number, number] = axis === 'x' ? [0, Math.PI / 2, 0]
        : axis === 'y' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
    const radius = 1.5;
    const arc = Math.min(Math.abs(speed), 4) / 4 * Math.PI * 1.7;

    useFrame((_, delta) => {
        const object = objectRef.transform;
        if (editMode || !object) return;

        const speed = properties.speed;
        const axis = properties.axis;
        object.rotation[axis] += delta * speed;
    });

    return <>
        {/* Local-space helper: axis sets its plane/color, speed sets arc length and direction. */}
        {editMode && <group rotation={plane}>
            <mesh>
                <torusGeometry args={[radius, 0.012, 6, 64]} />
                <meshBasicMaterial color={color} transparent opacity={0.25} toneMapped={false} />
            </mesh>
            {speed !== 0 && <group scale={[1, Math.sign(speed), 1]}>
                <mesh>
                    <torusGeometry args={[radius, 0.035, 8, 64, arc]} />
                    <meshBasicMaterial color={color} toneMapped={false} />
                </mesh>
                <mesh position={[radius * Math.cos(arc), radius * Math.sin(arc), 0]} rotation={[0, 0, arc]}>
                    <coneGeometry args={[0.12, 0.3, 12]} />
                    <meshBasicMaterial color={color} toneMapped={false} />
                </mesh>
            </group>}
        </group>}
        {children}
    </>;
}

const RotatorComponent: Component<RotatorProperties> = {
    name: 'Rotator',
    description: 'Rotate a node during play around the selected axis. Speed is radians per second.',
    View: RotatorView,
    properties: {
        speed: { default: 1, label: "Rotation Speed", step: 0.1, description: "Radians per second. The editor arrow reverses for negative speeds; its arc grows up to magnitude 4." },
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
