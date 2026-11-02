import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Matrix4 } from 'three';
import { useAssetRuntime, type AssetRuntime } from '../assets/AssetRuntime.js';
import type { PrefabInstanceProps } from './PrefabInstance.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import type { PreparedPrefab } from './preparePrefab.js';
import { createSpatialPrefabPlan, type PrefabStreamingOptions, type SpatialPrefabChunk, type SpatialPrefabPlan } from './spatialPrefabPlan.js';
import { useSpatialStreamScheduler } from './SpatialStreamingRuntime.js';
import type { SpatialStreamEntry, SpatialStreamPlacement } from './SpatialStreamScheduler.js';
import type { PrefabState } from '../../core/prefab.js';

// Placements of the same source reuse the immutable plan, just like loaded assets.
const plans = new WeakMap<AssetRuntime, WeakMap<PrefabState, Map<string, Promise<SpatialPrefabPlan>>>>();
function sharedPlan(prepared: PreparedPrefab, runtime: AssetRuntime, options: PrefabStreamingOptions, basePath = '') {
    let documents = plans.get(runtime);
    if (!documents) plans.set(runtime, documents = new WeakMap());
    let variants = documents.get(prepared.document);
    if (!variants) documents.set(prepared.document, variants = new Map());
    const key = JSON.stringify([basePath, options.cellSize, options.maxNodesPerChunk]);
    let promise = variants.get(key);
    if (!promise) {
        promise = createSpatialPrefabPlan(prepared.document, runtime, options, basePath);
        variants.set(key, promise);
        void promise.catch(() => { if (variants.get(key) === promise) variants.delete(key); });
    }
    return promise;
}

export function SpatialPrefabInstance(props: PrefabInstanceProps & { prepared: PreparedPrefab; options: PrefabStreamingOptions }) {
    const runtime = useAssetRuntime();
    const [resource, setResource] = useState<{ source: PreparedPrefab; key: string; plan: SpatialPrefabPlan } | null>(null);
    const callbacks = useRef(props); callbacks.current = props;
    const optionsValue = props.options;
    const options = useMemo(() => ({ ...optionsValue }), [optionsValue.cellSize, optionsValue.visibleDistance,
        optionsValue.preloadDistance, optionsValue.unloadDistance, optionsValue.maxNodesPerChunk]);
    const key = JSON.stringify([props.basePath, options.cellSize, options.maxNodesPerChunk]);
    useEffect(() => {
        let cancelled = false;
        callbacks.current.onStatus?.({ phase: 'compiling' });
        void sharedPlan(props.prepared, runtime, { cellSize: options.cellSize, maxNodesPerChunk: options.maxNodesPerChunk }, props.basePath).then(value => {
            if (!cancelled) setResource({ source: props.prepared, key, plan: value });
        }, error => { if (!cancelled) callbacks.current.onStatus?.({ phase: 'error', error }); });
        return () => { cancelled = true; };
    }, [props.prepared, props.basePath, options.cellSize, options.maxNodesPerChunk, key, runtime]);
    const plan = resource?.source === props.prepared && resource.key === key ? resource.plan : null;
    return plan ? <SpatialPlan key={key} props={props} plan={plan} options={options} /> : null;
}

type InstanceProps = PrefabInstanceProps & { prepared: PreparedPrefab };
type CellRecord = SpatialStreamEntry & { chunk: SpatialPrefabChunk; group: Group | null };

/** Cold cells are scheduler records, not mounted React or Three subtrees. */
function SpatialPlan({ props, plan, options }: { props: InstanceProps; plan: SpatialPrefabPlan; options: PrefabStreamingOptions }) {
    const host = useRef<Group>(null);
    const scheduler = useSpatialStreamScheduler();
    const [mounted, setMounted] = useState<CellRecord[]>([]);
    const callbacks = useRef(props); callbacks.current = props;
    const activated = useRef(false);
    const ready = useCallback(() => {
        if (activated.current) return;
        activated.current = true;
        callbacks.current.onStatus?.({ phase: 'active' });
        callbacks.current.onActivate?.();
    }, []);
    const records = useMemo(() => plan.chunks.map(chunk => {
        const record: CellRecord = {
            chunk, group: null, bounds: chunk.bounds, phase: 'cold', visible: false,
            mount: () => {
                callbacks.current.onChunkStatus?.({ id: chunk.id, phase: 'preparing' });
                setMounted(cells => cells.includes(record) ? cells : [...cells, record]);
            },
            unmount: () => {
                if (record.group) record.group.visible = false;
                callbacks.current.onChunkStatus?.({ id: chunk.id, phase: 'unloaded' });
                setMounted(cells => cells.filter(cell => cell !== record));
            },
            setVisible: visible => {
                if (record.group) record.group.visible = visible;
                if (visible) ready();
            },
        };
        return record;
    }), [plan, ready]);
    const placement = useMemo<SpatialStreamPlacement>(() => ({
        entries: records, options: {},
        matrix: () => {
            host.current?.updateWorldMatrix(true, false);
            return host.current?.matrixWorld ?? identity;
        },
    }), [records]);
    useLayoutEffect(() => { placement.options = options; }, [placement, options]);
    useLayoutEffect(() => scheduler.register(placement), [placement, scheduler]);
    const resident = useMemo(() => ({ ...props.prepared, document: plan.resident }), [plan, props.prepared]);
    return <group ref={host}>
        <PreparedPrefabInstance id={`${props.id}/resident`} url={props.url} basePath={props.basePath} prepared={resident}
            static onActivate={() => { if (!plan.chunks.length) ready(); }}
            onStatus={status => { if (status.phase === 'error') callbacks.current.onStatus?.(status); }}>
            {props.children}
        </PreparedPrefabInstance>
        {mounted.map(record => <StreamedCell key={record.chunk.id} record={record} props={props} />)}
    </group>;
}

const StreamedCell = memo(function StreamedCell({ record, props }: { record: CellRecord; props: InstanceProps }) {
    const { chunk } = record;
    const callbacks = useRef(props); callbacks.current = props;
    const prepared = useMemo(() => ({ ...props.prepared, document: chunk.document }), [props.prepared, chunk]);
    const groupRef = useCallback((group: Group | null) => { record.group = group; if (group) group.visible = record.visible; }, [record]);
    return <group ref={groupRef} visible={false}>
        {/* The plan already bounds this chunk. A second grid splits compatible
            neighbors into tiny draws without improving chunk residency. */}
        <PreparedPrefabInstance id={`${props.id}/cell/${chunk.id}`} url={props.url} basePath={props.basePath}
            prepared={prepared} static spatialCellSize={null}
            onStatus={status => {
                if (record.phase !== 'preparing') return;
                if (status.phase === 'active') {
                    record.phase = 'ready';
                    callbacks.current.onChunkStatus?.({ id: chunk.id, phase: 'ready' });
                } else if (status.phase === 'error') {
                    record.phase = 'error';
                    callbacks.current.onChunkStatus?.({ id: chunk.id, phase: 'error', error: status.error });
                    callbacks.current.onStatus?.(status);
                }
            }} />
    </group>;
});
const identity = new Matrix4();
