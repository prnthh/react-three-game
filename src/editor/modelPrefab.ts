import type { Object3D } from 'three';
import { decomposeModelToPrefabNodes as decompose, type DecomposeModelOptions } from '../core/modelPrefab.js';
import { getTextureImageDataUrl } from '../browser/index.js';

export type { DecomposeModelOptions, DecomposedPrefabNodes } from '../core/modelPrefab.js';

/** Editor adapter: preserve browser image embedding while core stays DOM-free. */
export function decomposeModelToPrefabNodes(object: Object3D, options: DecomposeModelOptions = {}) {
    return decompose(object, {
        ...options,
        getTexturePath: (texture, usage) => getTextureImageDataUrl(texture.image) ?? options.getTexturePath?.(texture, usage),
    });
}
