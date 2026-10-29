import { triangleMesh } from 'crashcat';

// BVH construction and active-edge preprocessing never run on the render thread.
self.onmessage = (event: MessageEvent<{ id: number; positions: number[]; indices: number[] }>) => {
    const { id, positions, indices } = event.data;
    const start = performance.now();
    try {
        const shape = triangleMesh.create({ positions, indices });
        self.postMessage({ id, shape, buildMs: performance.now() - start });
    } catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
};
