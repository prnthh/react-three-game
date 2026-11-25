import type { RenderCallback, RootStore } from '@react-three/fiber';

// R3F runs lower priorities first. Positive priorities take ownership of rendering.
export const framePriority = {
    gameplay: -1,
    followCamera: -0.75,
    streamingPlacements: -0.5,
    streamingAdmission: -0.25,
} as const;

/** Resume preparation after the browser has had a chance to present a frame. */
export const yieldToFrame = () => new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'undefined') setTimeout(resolve, 0);
    else requestAnimationFrame(() => setTimeout(resolve, 0));
});

/** Subscribe at the same priority as useFrame, for services with a conditional lifetime. */
export function subscribeFrame(store: RootStore, callback: RenderCallback, priority = 0) {
    return store.getState().internal.subscribe({ current: callback }, priority, store);
}
