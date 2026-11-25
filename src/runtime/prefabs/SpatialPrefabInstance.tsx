import type { PrefabStreamingOptions } from './streamingOptions.js';
import { memo, startTransition, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Box3, Group } from 'three';
import { useThree } from '@react-three/fiber';
import { useAssetRuntime, type AssetRuntime } from '../assets/AssetRuntime.js';
import type { PrefabInstanceProps, PrefabInstanceStatus } from './PrefabInstance.js';
import { PlacementGroup } from './PlacementGroup.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import { createSpatialPrefabPlan, type SpatialPrefabChunk, type SpatialPrefabPlan } from './spatialPrefabPlan.js';
import { useStreamPlacement } from './useStreamPlacement.js';
import type { SpatialStreamEntry } from './SpatialStreamScheduler.js';
import type { PrefabState } from '../../core/prefab.js';
import { useStreamedMaterialDefinitions } from '../rendering/MaterialPoolProvider.js';
import { StaticPrimitiveBatchView } from '../rendering/StaticPrimitiveBatchView.js';
import { getComponent, getComponentRegistryVersion } from '../../core/ComponentRegistry.js';
import { useMaterialOverrides } from '../components/MaterialComponent.js';
import { ComponentLookupContext } from './nodePlan.js';
import type { ShaderCompileTiming } from '../rendering/compileInSlices.js';
import { registerChunkDraws } from '../rendering/chunkFrustum.js';

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

type SpatialPlacementProps = Pick<PrefabInstanceProps, 'id' | 'basePath' | 'children' | 'onStatus' | 'onActivate' | 'onChunkStatus' | 'onChunkTiming'>;
export function SpatialPrefabInstance({ document, options, ...placement }: SpatialPlacementProps & { document: PrefabState; options: PrefabStreamingOptions }) {
    const runtime = useAssetRuntime();
    const lookup = useContext(ComponentLookupContext);
    const overrides = useMaterialOverrides();
    const hasMaterialOverrides = Object.keys(overrides).length > 0;
    const [resource, setResource] = useState<{ source: PrefabState; key: string; plan: SpatialPrefabPlan } | null>(null);
    const onStatus = useRef(placement.onStatus);
    onStatus.current = placement.onStatus;
    const { cellSize, maxNodesPerChunk } = options;
    const key = JSON.stringify([placement.basePath, cellSize, maxNodesPerChunk, !hasMaterialOverrides, getComponentRegistryVersion()]);
    useEffect(() => {
        let cancelled = false;
        onStatus.current?.({ phase: 'compiling' });
        void sharedPlan(document, runtime, key, { cellSize, maxNodesPerChunk }, !hasMaterialOverrides, lookup, placement.basePath).then(value => {
            if (!cancelled) setResource({ source: document, key, plan: value });
        }, error => { if (!cancelled) onStatus.current?.({ phase: 'error', error }); });
        return () => { cancelled = true; };
    }, [document, placement.basePath, cellSize, maxNodesPerChunk, key, runtime, hasMaterialOverrides, lookup]);
    const plan = resource?.source === document && resource.key === key ? resource.plan : null;
    return plan ? <SpatialPlan key={key} {...placement} plan={plan} hasMaterialOverrides={hasMaterialOverrides} /> : null;
}

type Cell = {
    chunk: SpatialPrefabChunk;
    group: PlacementGroup;
    onStatus(status: PrefabInstanceStatus): void;
    onShaderTiming?: (timing: ShaderCompileTiming) => void;
};

/** Cold cells are scheduler records. Three objects are created on admission. */
function SpatialPlan({ plan, hasMaterialOverrides, ...props }: SpatialPlacementProps & { plan: SpatialPrefabPlan; hasMaterialOverrides: boolean }) {
    useStreamedMaterialDefinitions(plan.materials, props.basePath);
    const scene = useThree(state => state.scene);
    const renderer = useThree(state => state.gl);
    const host = useMemo(() => new PlacementGroup(), []);
    const [mounted, setMounted] = useState<Cell[]>([]);
    const drawRoot = useRef<Group>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    const placement = useMemo(() => {
        const drawCells = new Map<number, { group: Group; bounds: Box3 }>();
        let active = false;
        const activate = () => {
            if (active) return;
            active = true;
            callbacks.current.onStatus?.({ phase: 'active' });
            callbacks.current.onActivate?.();
        };
        return {
            tree: plan.tree, activate, drawCells,
            matrix: () => {
                const parent = host.parent;
                parent?.updateWorldMatrix(true, false);
                return parent?.matrixWorld ?? host.matrixWorld;
            },
            entries: plan.chunks.map((chunk, index) => {
                const { id, bounds, rendererBounds } = chunk;

                const entry: SpatialStreamEntry = {
                    bounds, rendererBounds, phase: 'cold',
                    mount() {
                        const group = new PlacementGroup();
                        group.visible = false;
                        const reportTiming = callbacks.current.onChunkTiming;
                        const admittedAt = reportTiming ? performance.now() : 0;
                        let compilingAt = admittedAt;
                        let shaders: ShaderCompileTiming | undefined;
                        const mountedCell: Cell = {
                            chunk, group,
                            onShaderTiming: reportTiming ? timing => { shaders = timing; } : undefined,
                            onStatus(status) {
                                if (entry.phase !== 'preparing') return;
                                if (status.phase === 'compiling' && reportTiming) compilingAt = performance.now();
                                else if (status.phase === 'active') {
                                    entry.phase = 'ready';
                                    if (reportTiming) {
                                        const readyAt = performance.now();
                                        reportTiming({ id, phase: 'ready', admittedAt, compilingAt, readyAt, shaders });
                                        reportTiming({ id, phase: 'visible', readyAt, visibleAt: readyAt });
                                    }
                                    if (chunk.cullable) drawCells.set(index, { group, bounds });
                                    group.visible = true;
                                    callbacks.current.onChunkStatus?.({ id, phase: 'ready' });
                                    activate();
                                } else if (status.phase === 'error') {
                                    entry.phase = 'error';
                                    callbacks.current.onChunkStatus?.({ id, phase: 'error', error: status.error });
                                    callbacks.current.onStatus?.(status);
                                }
                            },
                        };
                        callbacks.current.onChunkStatus?.({ id, phase: 'preparing' });
                        startTransition(() => setMounted(cells => [...cells, mountedCell]));
                    },
                };
                return entry;
            }),
        };
    }, [plan, host]);
    // A material override can move vertices outside the planned bounds.
    useLayoutEffect(() => {
        if (!hasMaterialOverrides && plan.chunks.some(chunk => chunk.cullable))
            return registerChunkDraws(renderer, scene, drawRoot.current!, placement.drawCells, placement.tree);
    }, [renderer, scene, plan, placement, hasMaterialOverrides]);
    useStreamPlacement(placement);
    const renderCell = (cell: Cell) => <StreamedCell key={cell.group.uuid} cell={cell} placementId={props.id} basePath={props.basePath} />;
    return <primitive object={host} matrixAutoUpdate={false}>
        <PreparedPrefabInstance id={`${props.id}/resident`} basePath={props.basePath} document={plan.resident}
            static={plan.residentStatic && props.children == null} onActivate={plan.chunks.length ? undefined : placement.activate}
            onStatus={status => { if (status.phase === 'error') callbacks.current.onStatus?.(status); }}>
            {props.children}
        </PreparedPrefabInstance>
        <group ref={drawRoot} matrixAutoUpdate={false}>{mounted.filter(cell => cell.chunk.cullable).map(renderCell)}</group>
        {mounted.filter(cell => !cell.chunk.cullable).map(renderCell)}
    </primitive>;
}

// Admitting one cell should not reconcile the contents of already mounted cells.
const StreamedCell = memo(function StreamedCell({ cell, placementId, basePath }: { cell: Cell; placementId: string; basePath?: string }) {
    return <PreparedPrefabInstance id={`${placementId}/cell/${cell.chunk.id}`}
        basePath={basePath} document={cell.chunk.document} streamGroup={cell.group} onStatus={cell.onStatus}
        onShaderTiming={cell.onShaderTiming}>
        {cell.chunk.batches?.map((batch, index) => <StaticPrimitiveBatchView key={index} batch={batch} />)}
    </PreparedPrefabInstance>;
});
