import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Object3D } from 'three';
import type { Prefab } from '../core/types.js';
import { normalizePrefab } from '../core/prefab.js';
import { importGLBData, loadGLBScene, disposeModelResources } from '../core/modelPrefab.js';
import { exportPrefabToGLB } from '../headless/index.js';

interface AssetOptions {
    /** Root for prefab/model paths, including /prefabs/... paths. Defaults to cwd. */
    assetRoot?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}

/** Scene JSON → GLB. Built-ins only; custom components and texture maps are ignored. */
async function sceneToGLB(scene: Prefab, { assetRoot = '.', signal, timeoutMs }: AssetOptions = {}): Promise<ArrayBuffer> {
    const models = new Set<Object3D>();
    const abort = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
    async function readAsset(path: string) {
        requestSignal.throwIfAborted();
        if (/^(?:https?:|data:)/i.test(path)) {
            const response = await fetch(path, { signal: requestSignal });
            if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${path}`);
            return new Uint8Array(await response.arrayBuffer());
        }
        const file = path.startsWith('file:') ? fileURLToPath(path) : resolve(assetRoot, path.replace(/^\/+/, ''));
        return readFile(file, { signal: requestSignal });
    }
    try {
        return await exportPrefabToGLB(scene, { signal: requestSignal, timeoutMs, loaders: {
            prefab: async path => normalizePrefab(JSON.parse(new TextDecoder().decode(await readAsset(path)))),
            model: async path => {
                const model = await loadGLBScene(await readAsset(path));
                models.add(model);
                if (requestSignal.aborted) { disposeModels(); requestSignal.throwIfAborted(); }
                return model;
            },
        } });
    } finally {
        abort.abort();
        disposeModels();
    }
    function disposeModels() {
        disposeModelResources(models);
        models.clear();
    }
}

export type ConvertOptions = AssetOptions & (
    | { from: 'scene'; to: 'glb' }
    | { from: 'glb'; to: 'scene' }
);

/** Convert static scene JSON and GLB bytes in Node. Custom components and textures are omitted. */
export function convert(input: Prefab, options: AssetOptions & { from: 'scene'; to: 'glb' }): Promise<ArrayBuffer>;
export function convert(input: ArrayBuffer | ArrayBufferView, options: AssetOptions & { from: 'glb'; to: 'scene' }): Promise<Prefab>;
export async function convert(input: Prefab | ArrayBuffer | ArrayBufferView, options: ConvertOptions): Promise<ArrayBuffer | Prefab> {
    options.signal?.throwIfAborted();
    if (options.from === 'scene' && options.to === 'glb') return sceneToGLB(input as Prefab, options);
    if (options.from === 'glb' && options.to === 'scene') return importGLBData(input as ArrayBuffer | ArrayBufferView);
    throw new Error('Supported conversions: scene → glb and glb → scene');
}

export { registerBuiltInComponents } from '../runtime/components/index.js';
