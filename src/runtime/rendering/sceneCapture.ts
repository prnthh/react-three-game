import type { Camera, Scene, WebGLRenderer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

const renderers = new WeakMap<object, () => void | Promise<void>>();
const captures = new WeakMap<object, Promise<unknown>>();

/** Camera/material overrides must be restored before another capture snapshots
 * the scene. Keep this separate from shader preparation, which can span frames. */
export function withSceneCapture<T>(renderer: object, capture: () => Promise<T>): Promise<T> {
    const work = (captures.get(renderer) ?? Promise.resolve()).catch(() => {}).then(capture);
    captures.set(renderer, work);
    const release = () => { if (captures.get(renderer) === work) captures.delete(renderer); };
    void work.then(release, release);
    return work;
}

/** Preparation can leave an offscreen target selected between batches. Frames
 * and captures must both present to the canvas, then restore that standing state. */
export function renderToScreen(renderer: Pick<WebGPURenderer, 'getRenderTarget' | 'setRenderTarget' | 'getMRT' | 'setMRT'>, render: () => void) {
    const target = renderer.getRenderTarget(), mrt = renderer.getMRT();
    try {
        renderer.setRenderTarget(null); renderer.setMRT(null);
        render();
    } finally {
        renderer.setRenderTarget(target); renderer.setMRT(mrt);
    }
}

/** Let editor captures use the host's final composition (AO, bloom, etc.). */
export function registerSceneCaptureRenderer(renderer: object, render: () => void | Promise<void>) {
    renderers.set(renderer, render);
    return () => { if (renderers.get(renderer) === render) renderers.delete(renderer); };
}

export async function renderSceneCapture(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    const render = renderers.get(renderer);
    if (render) return await render();
    renderer.render(scene, camera);
}
