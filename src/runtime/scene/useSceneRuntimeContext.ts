import type { SceneRuntimeContext } from '../../core/componentContext.js';
import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useGameEvents } from './GameEvents.js';

export function useSceneRuntimeContext(): SceneRuntimeContext {
    const get = useThree(state => state.get);
    const events = useGameEvents();
    return useMemo(() => ({ get three() { return get(); }, events }), [get, events]);
}

