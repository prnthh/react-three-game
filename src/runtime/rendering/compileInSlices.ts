import { Group, type Camera, type Object3D, type Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

// Three temporarily changes renderer state during projection. Only one preparation
// job may run per renderer, including when several streamed placements arrive together.
const queues = new WeakMap<object, Promise<unknown>>();

const yieldToFrame = () => new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'undefined') setTimeout(resolve, 0);
    else requestAnimationFrame(() => setTimeout(resolve, 0));
});

/** Compile small groups between frames; an async GPU API alone does not yield shader generation. */
export function compileInSlices(
    renderer: Pick<WebGPURenderer, 'compileAsync'>,
    root: Object3D,
    camera: Camera,
    scene: Scene,
    { signal, batchSize = 4, yieldFrame = yieldToFrame }: {
        signal?: AbortSignal;
        batchSize?: number;
        yieldFrame?: () => Promise<void>;
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
        const size = Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : 4;
        for (let offset = 0; offset < objects.length; offset += size) {
            await yieldFrame();
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
            signal?.throwIfAborted();
        }
    };
    const next = (queues.get(renderer) ?? Promise.resolve()).catch(() => {}).then(run);
    queues.set(renderer, next);
    void next.finally(() => {
        if (queues.get(renderer) === next) queues.delete(renderer);
    }).catch(() => {});
    return next;
}
