import { Component, useEffect, type ReactNode } from 'react';
import { createRoot, extend, unmountComponentAtNode } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Prefab } from './core/types';
import { normalizePrefab } from './core/prefab';
import { getComponent, registerBuiltInComponents } from './core/ComponentRegistry';
import { builtInComponents } from './runtime/components';
import PrefabRoot from './runtime/prefabs/PrefabRoot';
import { preparePrefab } from './runtime/prefabs/preparePrefab';
import { encodePrefabSource, loadPrefabSource } from './runtime/prefabs/prefabSource';
import { createAssetCache, AssetCacheContext, type AssetLoaders } from './runtime/assets/assetCache';
import { AssetBoundary } from './runtime/assets/AssetBoundary';
import { SceneRuntime } from './runtime/SceneRuntime';
import { exportGLBData } from './export';

export interface HeadlessSceneOptions {
    basePath?: string;
    /** Scoped loaders for platform-specific models, textures, and prefab sources.
     * Returned resources belong to the caller; dispose them after the host is disposed. */
    loaders?: Partial<AssetLoaders>;
    signal?: AbortSignal;
    /** Bounds asset loading and React/Suspense readiness. Default: 30 seconds. */
    timeoutMs?: number;
    /** Used by authored cameras; no pixels or canvas are allocated. */
    width?: number;
    height?: number;
}

export interface HeadlessScene {
    /** Valid until dispose(); contains source meshes, without automatic instance batches. */
    scene: THREE.Scene;
    exportGLB(options?: Omit<GLTFExporterOptions, 'binary'>): Promise<ArrayBuffer>;
    dispose(): Promise<void>;
}

class HostErrorBoundary extends Component<{ children: ReactNode; onError(error: unknown): void }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: unknown) { this.props.onError(error); }
    render() { return this.state.failed ? null : this.props.children; }
}

function Committed({ ready }: { ready(): void }) {
    useEffect(ready, [ready]);
    return null;
}

/** Construct an authored scene through R3F, without a DOM root or a GPU.
 * Gameplay is disabled; custom renderWhenDisabled views must support this host.
 */
export async function createHeadlessScene(prefab: Prefab, options: HeadlessSceneOptions = {}): Promise<HeadlessScene> {
    const { width = 1, height = 1, timeoutMs = 30_000, basePath = '' } = options;
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('Headless dimensions must be finite and positive');
    if (!(timeoutMs > 0 && Number.isFinite(timeoutMs))) throw new Error('Headless timeoutMs must be finite and positive');
    options.signal?.throwIfAborted();
    registerBuiltInComponents(builtInComponents);
    extend(THREE as unknown as Parameters<typeof extend>[0]);

    const rootURL = encodePrefabSource(prefab);
    const input = normalizePrefab(prefab);
    const abort = new AbortController();
    const onAbort = () => abort.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => abort.abort(new Error(`Headless scene was not ready within ${timeoutMs}ms`)), timeoutMs);
    const unsupported = (kind: string) => async (path: string): Promise<never> => {
        throw new Error(`Headless ${kind} loading requires options.loaders.${kind}: ${path}`);
    };
    const cache = createAssetCache({
        model: unsupported('model'), texture: unsupported('texture'), sound: unsupported('sound'),
        ...options.loaders,
        prefab: async path => path === rootURL ? input
            : options.loaders?.prefab ? options.loaders.prefab(path)
                : loadPrefabSource(path),
    });
    // R3F needs a unique root identity, not a real canvas, when a renderer is supplied.
    const target = { width, height } as HTMLCanvasElement;
    let mounted = false;
    let disposed = false;
    let disposal: Promise<void> | undefined;
    const dispose = () => disposal ??= (async () => {
        disposed = true;
        if (mounted) await new Promise<void>(resolve => unmountComponentAtNode(target, () => resolve()));
        cache.dispose();
    })();
    try {
        // Validate definitions/cycles and settle declared resources before React mounts.
        await preparePrefab({
            getComponent(name) {
                const definition = getComponent(name);
                if (!definition) return undefined;
                if (name === 'Environment' || name === 'Text') {
                    throw new Error(`Headless scene does not support ${name} yet; it requires a GPU or font host adapter`);
                }
                return { ...definition, dependencies: properties =>
                    (definition.dependencies?.(properties) ?? []).filter(dependency => dependency.kind !== 'sound') };
            },
            loadDocument: path => cache.load('prefab', path),
            loadAsset: dependency => cache.load(dependency.kind, dependency.path),
        }, rootURL, { basePath, signal: abort.signal });
        abort.signal.throwIfAborted();
        const scene = new THREE.Scene();
        const root = createRoot(target);
        mounted = true;
        await root.configure({
            scene, frameloop: 'never', dpr: 1, size: { width, height, top: 0, left: 0 },
            gl: () => ({
                render() { throw new Error('The headless scene host cannot draw GPU frames'); },
                setSize() {}, setPixelRatio() {},
                domElement: target,
            }),
        });
        await new Promise<void>((resolve, reject) => {
            const cancelled = () => reject(abort.signal.reason);
            abort.signal.addEventListener('abort', cancelled, { once: true });
            const ready = () => { abort.signal.removeEventListener('abort', cancelled); resolve(); };
            const fail = (error: unknown) => { abort.signal.removeEventListener('abort', cancelled); reject(error); };
            if (abort.signal.aborted) { fail(abort.signal.reason); return; }
            root.render(
                <HostErrorBoundary onError={fail}>
                    <AssetCacheContext.Provider value={cache}>
                        <AssetBoundary atomic onError={fail}>
                            <SceneRuntime instancing={false}>
                                <PrefabRoot data={prefab} basePath={basePath} enabled={false} preparing />
                                <Committed ready={ready} />
                            </SceneRuntime>
                        </AssetBoundary>
                    </AssetCacheContext.Provider>
                </HostErrorBoundary>,
            );
        });
        abort.signal.throwIfAborted();
        scene.updateMatrixWorld(true);
        return {
            scene,
            async exportGLB(exportOptions) {
                if (disposed) throw new Error('Headless scene is disposed');
                ensureBlobReader();
                return exportGLBData(scene, exportOptions);
            },
            dispose,
        };
    } catch (error) {
        await dispose();
        throw error;
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
    }
}

/** One-shot conversion with guaranteed host cleanup. */
export async function exportPrefabToGLB(prefab: Prefab, options: HeadlessSceneOptions = {}): Promise<ArrayBuffer> {
    const host = await createHeadlessScene(prefab, options);
    try { return await host.exportGLB(); }
    finally { await host.dispose(); }
}

export type { AssetLoaders } from './runtime/assets/assetCache';

/** Three's exporter still uses FileReader for Blob bytes, even without textures.
 * Install only that small compatibility surface when the host does not supply it.
 * It is shared/idempotent so simultaneous exports cannot restore each other's shim.
 */
function ensureBlobReader() {
    if (typeof globalThis.FileReader !== 'undefined') return;
    class BlobReader {
        result: ArrayBuffer | string | null = null;
        error: unknown = null;
        onloadend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsArrayBuffer(blob: Blob) { void this.read(blob, false); }
        readAsDataURL(blob: Blob) { void this.read(blob, true); }
        private async read(blob: Blob, dataURL: boolean) {
            try {
                const bytes = await blob.arrayBuffer();
                if (dataURL) {
                    const chunks: string[] = [];
                    const view = new Uint8Array(bytes);
                    for (let offset = 0; offset < view.length; offset += 8192) {
                        chunks.push(String.fromCharCode(...view.subarray(offset, offset + 8192)));
                    }
                    this.result = `data:${blob.type || 'application/octet-stream'};base64,${btoa(chunks.join(''))}`;
                } else this.result = bytes;
            } catch (error) {
                this.error = error;
                this.onerror?.();
            }
            this.onloadend?.();
        }
    }
    Object.defineProperty(globalThis, 'FileReader', { value: BlobReader, configurable: true, writable: true });
}
