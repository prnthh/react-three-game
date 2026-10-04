import { useLayoutEffect } from 'react';
import { Mesh, type Object3D } from 'three';
import type { MeshRenderProperties } from './meshProperties.js';

/** Update each clone in place so inspector edits preserve skeletons and animation state. */
export function useModelMeshSettings(object: Object3D | null, properties: MeshRenderProperties, frustumCulledDefault = true) {
    const { castShadow = true, receiveShadow = true, frustumCulled = frustumCulledDefault } = properties;
    useLayoutEffect(() => {
        object?.traverse(child => {
            if (!(child instanceof Mesh)) return;
            child.castShadow = castShadow;
            child.receiveShadow = receiveShadow;
            child.frustumCulled = frustumCulled;
        });
    }, [object, castShadow, receiveShadow, frustumCulled]);
}
