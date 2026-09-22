import { useThree } from '@react-three/fiber';
import { useCallback } from 'react';
import type { Fog, Object3D } from 'three';
import type { Component, ComponentViewProps } from './ComponentRegistry';

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
    slot: 'fog',
    View: FogView,
    properties: {
        color: { type: 'color', default: '#ffffff' },
        near: { default: 10, min: 0, step: 1 },
        far: { default: 100, min: 0, step: 1 },
    },
};

export default FogComponent;
