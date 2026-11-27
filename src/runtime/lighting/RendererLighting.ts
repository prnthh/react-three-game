import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Lighting, type WebGPURenderer } from 'three/webgpu';
// @ts-expect-error Three's clustered-lighting addon has no published declaration yet.
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import { disposeAfterPrefabCompilation } from '../rendering/compileInSlices.js';

// Sibling scene runtimes can share a renderer and unmount in either order.
const shared = new WeakMap<WebGPURenderer, { host: Lighting; lighting: Lighting & { dispose(): void }; users: number }>();

export function RendererLighting() {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    useLayoutEffect(() => {
        let entry = shared.get(renderer);
        if (!entry) {
            const host = renderer.lighting;
            if (host?.constructor !== Lighting) return;
            entry = { host, lighting: new ClusteredLighting(), users: 0 };
            shared.set(renderer, entry);
            renderer.lighting = entry.lighting;
        }
        const owner = entry;
        owner.users++;
        return () => {
            if (--owner.users) return;
            shared.delete(renderer);
            if (renderer.lighting === owner.lighting) renderer.lighting = owner.host;
            disposeAfterPrefabCompilation(renderer, () => owner.lighting.dispose());
        };
    }, [renderer]);
    return null;
}
