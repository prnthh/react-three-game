import type { PrefabStreamingOptions } from './streamingOptions.js';
import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Matrix4 } from 'three';
import { useThree } from '@react-three/fiber';
import { useAssetRuntime, type AssetRuntime } from '../assets/AssetRuntime.js';
import { ResourceLoadError } from '../assets/assetCache.js';
import type { PrefabInstanceProps, PrefabInstanceStatus } from './PrefabInstance.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import type { PreparedPrefab } from './preparePrefab.js';
import { createSpatialPrefabPlan, type SpatialPrefabChunk, type SpatialPrefabPlan } from './spatialPrefabPlan.js';
import { useSpatialStreamScheduler } from './SpatialStreamingRuntime.js';
import type { SpatialStreamEntry, SpatialStreamPlacement } from './SpatialStreamScheduler.js';
import type { PrefabState } from '../../core/prefab.js';
import { useStreamedMaterialDefinitions } from '../rendering/MaterialPoolProvider.js';
import { StaticPrimitiveBatchView } from '../rendering/StaticPrimitiveBatchView.js';
import { getComponent, getComponentRegistryVersion } from '../../core/ComponentRegistry.js';
import { useMaterialOverrides } from '../components/MaterialComponent.js';
import { ComponentLookupContext } from './nodePlan.js';
import type { ShaderCompileTiming } from '../rendering/compileInSlices.js';
import { registerOcclusionCell } from '../rendering/chunkOcclusion.js';

// Placements of the same source reuse the immutable plan, just like loaded assets.
const plans = new WeakMap<AssetRuntime, WeakMap<PrefabState, Map<string, Promise<SpatialPrefabPlan>>>>();
function sharedPlan(document: PrefabState, runtime: AssetRuntime, key: string, options: PrefabStreamingOptions, batchPrimitives: boolean, lookup: typeof getComponent, basePath?: string) {
    const plan = () => createSpatialPrefabPlan(document, { ...runtime, batchPrimitives, lookup }, options, basePath);
    if (lookup !== getComponent) return plan();
    let documents = plans.get(runtime);
    if (!documents) plans.set(runtime, documents = new WeakMap());
    let variants = documents.get(document);
    if (!variants) documents.set(document, variants = new Map());
    let promise = variants.get(key);
    if (!promise) {
        promise = plan();
        variants.set(key, promise);
        void promise.catch(() => { if (variants.get(key) === promise) variants.delete(key); });
    }
    return promise;
}

type SpatialProps = PrefabInstanceProps & { prepared: PreparedPrefab; options: PrefabStreamingOptions };
export function SpatialPrefabInstance(props: SpatialProps) {
    const runtime = useAssetRuntime();
    const lookup = useContext(ComponentLookupContext);
    const overrides = useMaterialOverrides();
    const batchPrimitives = Object.keys(overrides).length === 0;
    const [resource, setResource] = useState<{ source: PreparedPrefab; key: string; plan: SpatialPrefabPlan } | null>(null);
    const callbacks = useRef(props); callbacks.current = props;
    const { cellSize, maxNodesPerChunk } = props.options;
    const key = JSON.stringify([props.basePath, cellSize, maxNodesPerChunk, batchPrimitives, getComponentRegistryVersion()]);
    useEffect(() => {
        let cancelled = false;
        callbacks.current.onStatus?.({ phase: 'compiling' });
        void sharedPlan(props.prepared.document, runtime, key, { cellSize, maxNodesPerChunk }, batchPrimitives, lookup, props.basePath).then(value => {
            if (!cancelled) setResource({ source: props.prepared, key, plan: value });
        }, error => { if (!cancelled) callbacks.current.onStatus?.({ phase: 'error', error }); });
        return () => { cancelled = true; };
    }, [props.prepared, props.basePath, cellSize, maxNodesPerChunk, key, runtime, batchPrimitives, lookup]);
    const plan = resource?.source === props.prepared && resource.key === key ? resource.plan : null;
    return plan ? <SpatialPlan key={key} props={props} plan={plan} /> : null;
}

type Cell = {
    chunk: SpatialPrefabChunk;
    group: Group;
    onStatus(status: PrefabInstanceStatus): void;
    onShaderTiming?: (timing: ShaderCompileTiming) => void;
    readyAt?: number;
};

/** Cold cells are scheduler records. Three objects are created on admission. */
function SpatialPlan({ props, plan }: { props: SpatialProps; plan: SpatialPrefabPlan }) {
    useStreamedMaterialDefinitions(plan.materials, props.basePath);
    const host = useRef<Group>(null);
    const scheduler = useSpatialStreamScheduler();
    const [mounted, setMounted] = useState<Cell[]>([]);
    const callbacks = useRef(props);
    callbacks.current = props;
    const placement = useMemo<SpatialStreamPlacement & { activate(): void }>(() => {
        let active = false;
        const activate = () => {
            if (active) return;
            active = true;
            callbacks.current.onStatus?.({ phase: 'active' });
            callbacks.current.onActivate?.();
        };
        return {
            activate, options: {},
            matrix: () => { host.current?.updateWorldMatrix(true, false); return host.current?.matrixWorld ?? identity; },
            entries: plan.chunks.map(chunk => {
                const { id, bounds } = chunk;
                let cell: Cell | undefined;
                let retry: (() => void) | undefined;
                const entry: SpatialStreamEntry = {
                    bounds, phase: 'cold', visible: false,
                    mount() {
                        retry?.();
                        retry = undefined;
                        const group = new Group();
                        const reportTiming = callbacks.current.onChunkTiming;
                        const admittedAt = reportTiming ? performance.now() : 0;
                        let compilingAt = admittedAt;
                        let shaders: ShaderCompileTiming | undefined;
                        const mountedCell: Cell = {
                            chunk, group,
                            onShaderTiming: reportTiming ? timing => { shaders = timing; } : undefined,
                            onStatus(status) {
                                if (cell !== mountedCell || entry.phase !== 'preparing') return;
                                if (status.phase === 'compiling' && reportTiming) compilingAt = performance.now();
                                else if (status.phase === 'active') {
                                    entry.phase = 'ready';
                                    if (reportTiming) {
                                        mountedCell.readyAt = performance.now();
                                        reportTiming({ id, phase: 'ready', admittedAt, compilingAt, readyAt: mountedCell.readyAt, shaders });
                                    }
                                    callbacks.current.onChunkStatus?.({ id, phase: 'ready' });
                                } else if (status.phase === 'error') {
                                    entry.phase = 'error';
                                    if (status.error instanceof ResourceLoadError) retry = status.error.retry;
                                    callbacks.current.onChunkStatus?.({ id, phase: 'error', error: status.error });
                                    callbacks.current.onStatus?.(status);
                                }
                            },
                        };
                        cell = mountedCell;
                        callbacks.current.onChunkStatus?.({ id, phase: 'preparing' });
                        setMounted(cells => [...cells, mountedCell]);
                    },
                    unmount() {
                        const evicted = cell;
                        cell = undefined;
                        callbacks.current.onChunkStatus?.({ id, phase: 'unloaded' });
                        setMounted(cells => cells.filter(candidate => candidate !== evicted));
                    },
                    setVisible(visible) {
                        if (cell) cell.group.visible = visible;
                        if (visible && cell?.readyAt !== undefined) {
                            callbacks.current.onChunkTiming?.({ id, phase: 'visible', readyAt: cell.readyAt, visibleAt: performance.now() });
                            cell.readyAt = undefined;
                        }
                        if (visible) activate();
                    },
                };
                return entry;
            }),
        };
    }, [plan]);
    useLayoutEffect(() => { placement.options = props.options; }, [placement, props.options]);
    useLayoutEffect(() => scheduler.register(placement), [placement, scheduler]);
    return <group ref={host}>
        <PreparedPrefabInstance id={`${props.id}/resident`} basePath={props.basePath} document={plan.resident}
            static onActivate={plan.chunks.length ? undefined : placement.activate}
            onStatus={status => { if (status.phase === 'error') callbacks.current.onStatus?.(status); }}>
            {props.children}
        </PreparedPrefabInstance>
        {mounted.map(cell => <StreamedCell key={cell.group.uuid} cell={cell} placementId={props.id} basePath={props.basePath} />)}
    </group>;
}

// Admitting one cell should not reconcile the contents of already mounted cells.
const StreamedCell = memo(function StreamedCell({ cell, placementId, basePath }: { cell: Cell; placementId: string; basePath?: string }) {
    const scene = useThree(state => state.scene);
    useLayoutEffect(() => registerOcclusionCell(scene, cell.group, cell.chunk.bounds), [scene, cell]);
    return <PreparedPrefabInstance id={`${placementId}/cell/${cell.chunk.id}`}
        basePath={basePath} document={cell.chunk.document} streamGroup={cell.group} onStatus={cell.onStatus}
        onShaderTiming={cell.onShaderTiming} static>
        {cell.chunk.batches?.map((batch, index) => <StaticPrimitiveBatchView key={index} batch={batch} />)}
    </PreparedPrefabInstance>;
});
const identity = new Matrix4();
