import { createContext, useContext, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { SpatialStreamScheduler } from './SpatialStreamScheduler.js';

const StreamingContext = createContext<SpatialStreamScheduler | null>(null);

export function SpatialStreamingRuntime({ children }: { children: ReactNode }) {
    const [scheduler] = useState(() => new SpatialStreamScheduler());
    const [cameraPosition] = useState(() => new Vector3());
    useFrame(({ camera }) => {
        camera.getWorldPosition(cameraPosition);
        scheduler.update(cameraPosition);
    }, -0.5);
    return <StreamingContext.Provider value={scheduler}>{children}</StreamingContext.Provider>;
}

export function useSpatialStreamScheduler() {
    const value = useContext(StreamingContext);
    if (!value) throw new Error('Spatial streaming requires SceneRuntime');
    return value;
}
