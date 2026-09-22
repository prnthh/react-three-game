import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { DirectionalLight, PointLight, SpotLight } from 'three';
import { gameEvents } from '../../tools/prefabeditor/GameEvents';

export type ShadowLight = DirectionalLight | PointLight | SpotLight;

/** Refresh all registered lights, or just the supplied lights, on the next render. */
export function invalidateShadows(lights?: readonly ShadowLight[]) {
    gameEvents.emit('shadows:invalidate', { lights });
}

/** Internal subscription, shared by built-in and custom React lights. */
export function subscribeShadowUpdates(light: ShadowLight, invalidate: () => void) {
    const refresh = () => {
        light.shadow.needsUpdate = true;
        invalidate();
    };
    refresh();
    return gameEvents.on('shadows:invalidate', ({ lights }) => {
        if (!lights || lights.includes(light)) refresh();
    });
}

/** Register a light for explicit shadow refreshes. autoUpdate remains owned by the light. */
export function useShadowUpdates(light: RefObject<ShadowLight | null>) {
    const invalidate = useThree(state => state.invalidate);
    // Ref targets can change without the ref object changing (e.g. switching CSM).
    const current = useRef<ShadowLight | null>(null);
    const unsubscribe = useRef<(() => void) | undefined>(undefined);
    useLayoutEffect(() => {
        if (current.current === light.current) return;
        unsubscribe.current?.();
        current.current = light.current;
        unsubscribe.current = light.current ? subscribeShadowUpdates(light.current, invalidate) : undefined;
    });
    useLayoutEffect(() => () => {
        unsubscribe.current?.();
        current.current = null;
    }, []);
}
