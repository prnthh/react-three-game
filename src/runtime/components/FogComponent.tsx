import { useThree } from '@react-three/fiber';
import { useCallback } from 'react';
import type { Fog, Object3D } from 'three';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface FogProperties {
    color: string;
    near: number;
    far: number;
}

function FogView({ properties: { color, near, far }, children }: ComponentViewProps<FogProperties>) {
    const scene = useThree(state => state.scene);
    const attachFog = useCallback((_parent: Object3D, fog: Fog) => {
        const previous = scene.fog;
        scene.fog = fog;
        return () => { scene.fog = previous; };
    }, [scene]);
    return <>
        <fog attach={attachFog} args={[color, near, far]} />
        {children}
    </>;
}

const FogComponent: Component<FogProperties> = {
    name: 'Fog',
    description: "Apply linear distance fog to the scene. Set color to match the background and near/far to the distances where fog begins and becomes opaque.",
    slot: 'fog',
    View: FogView,
    properties: {
        color: { type: 'color', default: '#ffffff' },
        near: { description: "Camera distance in scene units where fog starts.", default: 10, min: 0, step: 1 },
        far: { description: "Camera distance in scene units where fog is fully opaque; use a value greater than near.", default: 100, min: 0, step: 1 },
    },
};

export default FogComponent;
