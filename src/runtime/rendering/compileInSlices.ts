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

export type ShaderCompileTiming = {
    queuedMs: number;
    yieldMs: number;
    submitMs: number;
    awaitMs: number;
    objects: number;
    /** Three node-builder starts for this cell’s objects, when the renderer exposes the debug hook. */
    nodeBuilds?: number;
};

/** Compile small groups between frames; an async GPU API alone does not yield shader generation. */
export function compileInSlices(
    renderer: Pick<WebGPURenderer, 'compileAsync'> & { isWebGPURenderer?: boolean },
    root: Object3D,
    camera: Camera,
    scene: Scene,
    { signal, batchSize, timeBudgetMs = 3, yieldFrame = yieldToFrame, yieldBeforeFirstSlice = true, onTiming }: {
        signal?: AbortSignal;
        batchSize?: number;
        /** Reuse remaining slice time for cheap batches; 0 yields after every batch. */
        timeBudgetMs?: number;
        yieldFrame?: () => Promise<void>;
        yieldBeforeFirstSlice?: boolean;
        onTiming?: (timing: ShaderCompileTiming) => void;
    } = {},
): Promise<void> {
    const queuedAt = onTiming ? performance.now() : 0;
    const run = async () => {
        signal?.throwIfAborted();
        const timing: ShaderCompileTiming | undefined = onTiming && { queuedMs: performance.now() - queuedAt, yieldMs: 0, submitMs: 0, awaitMs: 0, objects: 0 };
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
        const defaultSize = renderer.isWebGPURenderer && Number(REVISION) >= 187 ? 16 : 2;
        const size = batchSize !== undefined && Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : defaultSize;
        const budget = Number.isFinite(timeBudgetMs) ? Math.max(0, Math.min(8, timeBudgetMs)) : 3;
        let sliceStarted = performance.now(), sliceBatches = 0;
        const leave = contexts.get(renderer)?.();
        // Compiles may yield while other passes render. Attribute only requests for
        // objects in this cell, including builds triggered by an overlapping pass.
        type BuilderHook = (builder: unknown, target: { object?: Object3D }) => void;
        const debug = timing && (renderer as { debug?: { onNodeBuilderCreated?: BuilderHook | null } }).debug;
        const previous = debug?.onNodeBuilderCreated;
        let observe: BuilderHook | undefined;
        if (timing && debug && previous !== undefined) {
            const tracked = new Set(objects);
            let builds = 0;
            timing.nodeBuilds = builds;
            observe = (builder, target) => {
                if (target.object && tracked.has(target.object)) timing.nodeBuilds = ++builds;
                previous?.(builder, target);
            };
            debug.onNodeBuilderCreated = observe;
        }
        try {
            for (let offset = 0; offset < objects.length; offset += size) {
                if (offset === 0 ? yieldBeforeFirstSlice : budget === 0 || performance.now() - sliceStarted >= budget || sliceBatches >= 8) {
                    const waitingAt = timing ? performance.now() : 0;
                    await yieldFrame();
                    sliceStarted = performance.now(); sliceBatches = 0;
                    if (timing) timing.yieldMs += sliceStarted - waitingAt;
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
                const submittedAt = timing ? performance.now() : 0;
                try { work = renderer.compileAsync(batch, camera, scene); }
                finally {
                    root.visible = visible;
                    batch.children.forEach((object, index) => { object.frustumCulled = culling[index]; });
                }
                const awaitingAt = timing ? performance.now() : 0;
                await work;
                if (timing) {
                    timing.submitMs += awaitingAt - submittedAt;
                    timing.awaitMs += performance.now() - awaitingAt;
                }
                sliceBatches++;
                signal?.throwIfAborted();
            }
        } finally {
            if (debug && observe && debug.onNodeBuilderCreated === observe) debug.onNodeBuilderCreated = previous;
            leave?.();
        }
        if (timing) {
            timing.objects = objects.length;
            onTiming?.(timing);
        }
    };
    const next = (queues.get(renderer) ?? Promise.resolve()).catch(() => {}).then(run);
    queues.set(renderer, next);
    void next.finally(() => {
        if (queues.get(renderer) === next) queues.delete(renderer);
    }).catch(() => {});
    return next;
}
