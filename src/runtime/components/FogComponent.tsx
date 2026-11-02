import { createPortal, useThree } from '@react-three/fiber';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface FogProperties {
    color: string;
    near: number;
    far: number;
}

function FogView({ properties: { color, near, far }, children }: ComponentViewProps<FogProperties>) {
    const scene = useThree(state => state.scene);
    return <>
        {createPortal(<fog attach="fog" args={[color, near, far]} />, scene)}
        {children}
    </>;
}

const FogComponent: Component<FogProperties> = {
    name: 'Fog',
    category: 'lighting',
    description: "Apply linear distance fog to the scene. Set color to match the background and near/far to the distances where fog begins and becomes opaque.",
    View: FogView,
    properties: {
        color: { type: 'color', default: '#ffffff' },
        near: { description: "Camera distance in scene units where fog starts.", default: 10, min: 0, step: 1 },
        far: { description: "Camera distance in scene units where fog is fully opaque; use a value greater than near.", default: 100, min: 0, step: 1 },
    },
};

export default FogComponent;
