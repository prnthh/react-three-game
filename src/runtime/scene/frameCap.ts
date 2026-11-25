import { addEffect, type RootStore } from '@react-three/fiber';
import { subscribeFrame } from './frame.js';

type Cap = { interval: number; next: number; due: boolean };
const caps = new Map<RootStore, Cap>();
let request: number, stopBefore: () => void;

// Wake the native R3F loop only for due canvases. It owns the clock, render
// order and global effects, including when an uncapped canvas is also active.
function schedule(now: number) {
    for (const [store, cap] of caps) {
        if (now + 0.25 < cap.next) continue;
        cap.next += (Math.floor((now + 0.25 - cap.next) / cap.interval) + 1) * cap.interval;
        cap.due = true;
        store.getState().invalidate();
    }
    request = requestAnimationFrame(schedule);
}

// React and asset completions can also invalidate a demand root between deadlines.
function admitFrames() {
    for (const [store, cap] of caps) {
        const state = store.getState();
        // Canvas.configure can reapply its 'always' prop on a resize.
        if (state.frameloop === 'always') store.setState({ frameloop: 'demand' });
        if (store.getState().frameloop !== 'demand' || state.gl.xr?.isPresenting) continue;
        state.internal.frames = cap.due ? 1 : 0;
    }
}

export function capFrames(store: RootStore, fps?: number | null) {
    const state = store.getState();
    if (!fps || !Number.isFinite(fps) || fps <= 0 || state.frameloop !== 'always' || typeof requestAnimationFrame === 'undefined') return;
    const xr = state.gl.xr;
    const cap = { interval: 1000 / fps, due: false, next: 0 };
    // XR can flush global effects for a different root. Consume admission
    // only when this particular canvas actually advances.
    const unsubscribe = subscribeFrame(store, () => { cap.due = false; }, -Infinity);
    function start() {
        if (xr?.isPresenting || store.getState().frameloop !== 'always') return;
        if (!caps.size) {
            stopBefore = addEffect(admitFrames);
            request = requestAnimationFrame(schedule);
        }
        cap.next = performance.now() + cap.interval;
        cap.due = false;
        caps.set(store, cap);
        store.setState({ frameloop: 'demand' });
        store.getState().invalidate();
    }
    function stop() {
        if (!caps.delete(store)) return;
        if (!caps.size) { stopBefore(); cancelAnimationFrame(request); }
        if (store.getState().frameloop === 'demand') {
            store.setState({ frameloop: 'always' });
            store.getState().invalidate();
        }
    }
    start();
    xr?.addEventListener?.('sessionstart', stop);
    xr?.addEventListener?.('sessionend', start);
    return () => {
        unsubscribe();
        xr?.removeEventListener?.('sessionstart', stop);
        xr?.removeEventListener?.('sessionend', start);
        stop();
    };
}
