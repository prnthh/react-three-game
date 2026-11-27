import type { PrefabStreamingOptions } from './streamingOptions.js';
import { type ReactElement, startTransition, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Box3, Group } from 'three';
import { useThree } from '@react-three/fiber';
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import type { PrefabInstanceProps, PrefabInstanceStatus } from './PrefabInstance.js';
import { PlacementGroup } from './PlacementGroup.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import { createSpatialPrefabPlan, type SpatialPrefabPlan } from './spatialPrefabPlan.js';
import { usePrefabPreparation } from './usePrefabPreparation.js';
import { useStreamPlacement } from './useStreamPlacement.js';
import type { SpatialStreamEntry } from './SpatialStreamScheduler.js';
import type { PrefabState } from '../../core/prefab.js';
import { useStreamedMaterialDefinitions } from '../rendering/MaterialPoolProvider.js';
import { StaticPrimitiveBatchView } from '../rendering/StaticPrimitiveBatchView.js';
import { getComponentRegistryVersion } from '../../core/ComponentRegistry.js';
import { useMaterialOverrides } from '../components/MaterialComponent.js';
import { ComponentLookupContext } from './nodePlan.js';
import { registerChunkDraws } from '../rendering/chunkFrustum.js';

type SpatialPlacementProps = Pick<PrefabInstanceProps, 'id' | 'basePath' | 'children' | 'onStatus' | 'onChunkTiming'>;
export function SpatialPrefabInstance({ document, options, ...placement }: SpatialPlacementProps & { document: PrefabState; options: PrefabStreamingOptions }) {
    const runtime = useAssetRuntime();
    const lookup = useContext(ComponentLookupContext);
    const overrides = useMaterialOverrides();
    const hasMaterialOverrides = Object.keys(overrides).length > 0;
    const { cellSize, maxNodesPerChunk } = options;
    const { basePath } = placement;
    const registryVersion = getComponentRegistryVersion();
    const buildPlan = useCallback((signal: AbortSignal) => createSpatialPrefabPlan(document,
        { ...runtime, lookup, batchPrimitives: !hasMaterialOverrides }, { cellSize, maxNodesPerChunk }, basePath, signal),
        [document, runtime, lookup, hasMaterialOverrides, cellSize, maxNodesPerChunk, basePath, registryVersion]);
    const plan = usePrefabPreparation(buildPlan, 'compiling', placement.onStatus);
    return plan && <SpatialPlan {...placement} plan={plan} hasMaterialOverrides={hasMaterialOverrides} />;
}

/** Cold cells are scheduler records. Three objects are created on admission. */
function SpatialPlan({ plan, hasMaterialOverrides, ...props }: SpatialPlacementProps & { plan: SpatialPrefabPlan; hasMaterialOverrides: boolean }) {
    useStreamedMaterialDefinitions(plan.materials, props.basePath);
    const renderer = useThree(state => state.gl);
    const host = useMemo(() => new PlacementGroup(), []);
    const [mounted, setMounted] = useState<{ cullable: ReactElement[]; uncullable: ReactElement[] }>({ cullable: [], uncullable: [] });
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
        };
        const entries = plan.chunks.map((chunk, index) => {
            const { id, bounds, rendererBounds } = chunk;

            const entry: SpatialStreamEntry = {
                bounds, rendererBounds, phase: 'cold',
                mount() {
                    const group = new PlacementGroup();
                    const { id: placementId, basePath, onChunkTiming: reportTiming } = callbacks.current;
                    const admittedAt = reportTiming ? performance.now() : 0;
                    let compilingAt = admittedAt;
                    function onStatus(status: PrefabInstanceStatus) {
                        if (entry.phase !== 'preparing') return;
                        if (status.phase === 'compiling' && reportTiming) compilingAt = performance.now();
                        else if (status.phase === 'active') {
                            entry.phase = 'settled';
                            reportTiming?.({ id, admittedAt, compilingAt, readyAt: performance.now() });
                            if (chunk.cullable) drawCells.set(index, { group, bounds });
                            activate();
                        } else if (status.phase === 'error') {
                            entry.phase = 'settled';
                            callbacks.current.onStatus?.({ ...status, cellId: id });
                        }
                    }
                    const cell = <PreparedPrefabInstance key={id} id={`${placementId}/cell/${id}`}
                        document={chunk.document.childIdsById[chunk.document.rootId]?.length ? chunk.document : undefined} basePath={basePath} streamGroup={group} onStatus={onStatus}>
                        {chunk.batches?.map((batch, i) => <StaticPrimitiveBatchView key={i} batch={batch} basePath={basePath} />)}
                    </PreparedPrefabInstance>;
                    const list = chunk.cullable ? 'cullable' : 'uncullable';
                    startTransition(() => setMounted(cells => ({ ...cells, [list]: [...cells[list], cell] })));
                },
            };
            return entry;
        });
        return {
            tree: plan.tree, entries, activate, drawCells,
            matrix() {
                host.updateWorldMatrix(true, false);
                return host.matrixWorld;
            },
        };
    }, [plan, host]);
    useLayoutEffect(() => {
        // Material overrides may move vertices outside the planned bounds.
        if (!hasMaterialOverrides && plan.chunks.some(chunk => chunk.cullable))
            return registerChunkDraws(renderer, drawRoot.current!, placement.drawCells, placement.tree);
    }, [renderer, plan, placement, hasMaterialOverrides]);
    useStreamPlacement(placement);
    return <primitive object={host} matrixAutoUpdate={false}>
        <PreparedPrefabInstance id={`${props.id}/resident`} basePath={props.basePath} document={plan.resident}
            static={plan.residentStatic && props.children == null} onStatus={status => {
                if (status.phase === 'error') callbacks.current.onStatus?.(status);
                else if (status.phase === 'active' && !plan.chunks.length) placement.activate();
            }}>
            {props.children}
        </PreparedPrefabInstance>
        <group ref={drawRoot} matrixAutoUpdate={false}>{mounted.cullable}</group>
        {mounted.uncullable}
    </primitive>;
}
