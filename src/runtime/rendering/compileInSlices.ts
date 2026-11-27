import { yieldToFrame } from '../scene/frame.js';
import { Group, REVISION, type Camera, type Object3D, type Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

// Three temporarily changes renderer state during projection. Only one preparation
// job may run per renderer, including when several streamed placements arrive together.
const queues = new WeakMap<object, Promise<unknown>>();
const contexts = new WeakMap<object, () => () => void>();

/** Jobs already admitted may still hold a render pass's target across yields.
 * Replacement passes can take over immediately; retire old resources after those jobs release them. */
export function disposeAfterPrefabCompilation(renderer: object, dispose: () => void) {
    const pending = queues.get(renderer);
    if (pending) void pending.then(dispose, dispose);
    else dispose();
}

/** Match the main pass's target/MRT while preparing streamed objects. A custom
 * render loop must save/restore this standing state around its screen render. */
export function registerPrefabCompilationContext(renderer: object, enter: () => () => void) {
    contexts.set(renderer, enter);
    return () => { if (contexts.get(renderer) === enter) contexts.delete(renderer); };
}

/** Compile small groups between frames; an async GPU API alone does not yield shader generation. */
export function compileInSlices(
    renderer: Pick<WebGPURenderer, 'compileAsync'> & { isWebGPURenderer?: boolean },
    root: Object3D,
    camera: Camera,
    scene: Scene,
    { signal, yieldFrame = yieldToFrame, yieldBeforeFirstSlice = true }: {
        signal?: AbortSignal;
        yieldFrame?: () => Promise<void>;
        yieldBeforeFirstSlice?: boolean;
    } = {},
): Promise<void> {
    const run = async () => {
        signal?.throwIfAborted();
        const objects: Object3D[] = [];
        // The staging root is hidden, but authored visibility below it is respected.
        const collect = (object: Object3D) => {
            if (object !== root && !object.visible) return;
            if ('geometry' in object && object.layers.test(camera.layers)) objects.push(object);
            object.children.forEach(collect);
        };
        collect(root);
        const batch = new Group();
        batch.matrixAutoUpdate = false;
        batch.matrixWorldAutoUpdate = false;
        // r187 yields within shader generation. Amortize its full target-scene
        // light traversal while bounding the synchronous projection and cancellation delay.
        const size = renderer.isWebGPURenderer && Number(REVISION) >= 187 ? 16 : 2;
        let sliceStarted = performance.now(), sliceBatches = 0;
        const leave = contexts.get(renderer)?.();
        try {
            for (let offset = 0; offset < objects.length; offset += size) {
                if (offset === 0 ? yieldBeforeFirstSlice : performance.now() - sliceStarted >= 3 || sliceBatches >= 8) {
                    await yieldFrame();
                    sliceStarted = performance.now(); sliceBatches = 0;
                }
                signal?.throwIfAborted();
                // Borrow references without reparenting, preserving world transforms and
                // scene cache identity. The temporary group never enters the live scene.
                batch.children = objects.slice(offset, offset + size);
                batch.children.forEach(object => object.updateWorldMatrix(true, false));
                const culling = batch.children.map(object => object.frustumCulled);
                batch.children.forEach(object => { object.frustumCulled = false; });
                const visible = root.visible;
                root.visible = true;
                let work: Promise<void>;
                try { work = renderer.compileAsync(batch, camera, scene); }
                finally {
                    root.visible = visible;
                    batch.children.forEach((object, index) => { object.frustumCulled = culling[index]; });
                }
                await work;
                sliceBatches++;
                signal?.throwIfAborted();
            }
        } finally {
            leave?.();
        }
    };
    const next = (queues.get(renderer) ?? Promise.resolve()).catch(() => {}).then(run);
    queues.set(renderer, next);
    void next.finally(() => {
        if (queues.get(renderer) === next) queues.delete(renderer);
    }).catch(() => {});
    return next;
}
