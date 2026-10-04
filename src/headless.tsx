import { Component, useEffect, type ReactNode } from 'react';
import { createRoot, extend, unmountComponentAtNode } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Prefab, GameObject } from './core/types.js';
import { getMaterialDefinition, normalizePrefab, type PrefabState } from './core/prefab.js';
import { getComponent } from './core/ComponentRegistry.js';
import { builtInComponents, registerBuiltInComponents } from './runtime/components/index.js';
import { ComponentLookupContext } from './runtime/prefabs/nodePlan.js';
import PrefabRoot from './runtime/prefabs/PrefabRoot.js';
import { preparePrefab } from './runtime/prefabs/preparePrefab.js';
import { encodePrefabSource, loadPrefabSource } from './runtime/prefabs/prefabSource.js';
import { createAssetCache, AssetCacheContext, type AssetLoaders } from './runtime/assets/assetCache.js';
import { AssetBoundary } from './runtime/assets/AssetBoundary.js';
import { SceneRuntime } from './runtime/SceneRuntime.js';
import { exportGLBData } from './core/modelPrefab.js';

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
    return mountHeadlessScene(prefab, options, getComponent);
}

async function mountHeadlessScene(prefab: Prefab, options: HeadlessSceneOptions, lookup: typeof getComponent): Promise<HeadlessScene> {
    const { width = 1, height = 1, timeoutMs = 30_000, basePath = '' } = options;
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('Headless dimensions must be finite and positive');
    if (!(timeoutMs > 0 && Number.isFinite(timeoutMs))) throw new Error('Headless timeoutMs must be finite and positive');
    options.signal?.throwIfAborted();
    registerBuiltInComponents();
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
                const definition = lookup(name);
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
                            <ComponentLookupContext.Provider value={lookup}><SceneRuntime instancing={false}>
                                <PrefabRoot data={prefab} basePath={basePath} enabled={false} preparing />
                                <Committed ready={ready} />
                            </SceneRuntime></ComponentLookupContext.Provider>
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

// Only built-in components that contribute standard static Three.js scene data.
const exportTypes = new Set(['Transform', 'Geometry', 'BufferGeometry', 'Material',
    'Model', 'SkinnedMesh', 'PrefabRef', 'Camera', 'DirectionalLight', 'PointLight', 'SpotLight']);
const exportDefinitions = new Map(builtInComponents.filter(component => exportTypes.has(component.name)).map(component => [component.name, component]));
const exportLookup: typeof getComponent = name => exportDefinitions.get(name);

/** Drop custom components without loading their definitions, preserving child nodes. */
function staticPrefab(document: Prefab): Prefab {
    const visit = (node: GameObject): GameObject => {
        const entries = Object.entries(node.components ?? {});
        // Environment children are capture-only geometry, not ordinary scene children.
        if (entries.some(([, component]) => component?.type === 'Environment')) {
            return { ...node, components: {}, children: [] };
        }
        return { ...node,
            components: Object.fromEntries(entries.filter(([, component]) => component && exportTypes.has(component.type)).map(([key, component]) => {
                if (component?.type !== 'Material') return [key, component];
                const { texture, normalMapTexture, ...properties } = component.properties;
                return [key, { ...component, properties: getMaterialDefinition(component.properties)
                    ? { materialType: 'standard', ...properties } : properties }];
            })),
            children: node.children?.map(visit),
        };
    };
    return { ...document, root: visit(document.root) };
}

function prefabFromState(state: PrefabState): Prefab {
    // Preserve explicit properties; denormalization compacts using the application registry.
    const node = (id: string): GameObject => ({ ...state.nodesById[id], children: state.childIdsById[id].map(node) });
    return { id: state.prefabId, name: state.prefabName, root: node(state.rootId) };
}

/** Lossy built-ins-only export. Custom views, dependencies and modifiers never run. */
export async function exportPrefabToGLB(prefab: Prefab, options: HeadlessSceneOptions = {}): Promise<ArrayBuffer> {
    const loadDocument = options.loaders?.prefab ?? loadPrefabSource;
    const host = await mountHeadlessScene(staticPrefab(prefab), {
        ...options,
        loaders: { ...options.loaders, prefab: async path => normalizePrefab(staticPrefab(prefabFromState(await loadDocument(path)))) },
    }, exportLookup);
    try { return await host.exportGLB(); }
    finally { await host.dispose(); }
}

export type { AssetLoaders } from './runtime/assets/assetCache.js';
