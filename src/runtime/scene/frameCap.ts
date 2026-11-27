import { addEffect, addTail, type RootStore } from '@react-three/fiber';
import { subscribeFrame } from './frame.js';

type Cap = { interval: number; next: number; afterDraw: number };
const caps = new Map<RootStore, Cap>();
let timer: ReturnType<typeof setTimeout> | undefined;
let stopBefore: () => void, stopTail: () => void;

// Decide on the display tick R3F is about to render. A separate RAF that
// invalidates at the deadline would schedule the actual draw one refresh later.
function admitFrames(now: number) {
    for (const [store, cap] of caps) {
        const state = store.getState();
        if (state.frameloop === 'always') store.setState({ frameloop: 'demand' });
        if (state.frameloop === 'never' || state.gl.xr?.isPresenting) continue;
        const late = now + 0.25 - cap.next;
        state.internal.frames = late >= 0 ? 2 : 0;
        if (late >= 0) cap.afterDraw = cap.next + (Math.floor(late / cap.interval) + 1) * cap.interval;
    }
}

// R3F stops after a tick with no draws. Re-arm after it clears its running flag
// so the next refresh can evaluate its deadline, including after a missed vsync.
function wakeCappedRoot() {
    clearTimeout(timer);
    let first: RootStore | undefined, deadline = Infinity;
    for (const [store, cap] of caps) {
        const state = store.getState();
        if (state.internal.active && state.frameloop === 'demand' && !state.gl.xr?.isPresenting && cap.next < deadline) {
            deadline = cap.next;
            first = store;
        }
    }
    if (!first) return;
    // Leave one refresh of headroom. Low caps can sleep between deadlines.
    const delay = deadline - performance.now() - 1000 / 60;
    if (delay > 1) timer = setTimeout(wakeCappedRoot, delay);
    else first.getState().invalidate();
}

export function capFrames(store: RootStore, fps?: number | null) {
    const state = store.getState();
    if (!fps || !Number.isFinite(fps) || fps <= 0 || state.frameloop !== 'always' || typeof requestAnimationFrame === 'undefined') return;
    const xr = state.gl.xr;
    const cap = { interval: 1000 / fps, next: 0, afterDraw: 0 };
    // Another canvas (including XR) can flush the shared effects independently.
    // Consume a deadline only when this root actually draws.
    const unsubscribe = subscribeFrame(store, () => { cap.next = cap.afterDraw; }, -Infinity);
    function start() {
        if (xr?.isPresenting || store.getState().frameloop !== 'always') return;
        if (!caps.size) {
            stopBefore = addEffect(admitFrames);
            stopTail = addTail(() => queueMicrotask(wakeCappedRoot));
        }
        cap.next = performance.now() + cap.interval;
        caps.set(store, cap);
        store.setState({ frameloop: 'demand' });
        store.getState().invalidate();
    }
    function stop() {
        if (!caps.delete(store)) return;
        if (!caps.size) { stopBefore(); stopTail(); clearTimeout(timer); }
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
