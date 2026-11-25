import { startTransition, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import { SceneRuntime } from '../SceneRuntime.js';
import type { PreparedPrefab } from './preparePrefab.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import { SpatialPrefabInstance } from './SpatialPrefabInstance.js';
import { ChunkSettingsContext, readChunkSettings } from '../components/ChunkSettingsComponent.js';
import { PrefabContext, SceneContext } from '../scene/SceneContext.js';
import type { PrefabState } from '../../core/prefab.js';
import type { ShaderCompileTiming } from '../rendering/compileInSlices.js';

export type PrefabInstanceStatus =
    | { phase: 'loading' }
    | { phase: 'compiling' }
    | { phase: 'active' }
    | { phase: 'error'; error: unknown };

export interface PrefabInstanceProps {
    /** Unique placement identity within the enclosing scene. */
    id: string;
    url?: string;
    /** Prepared from an embedded definition with the same staged loading as a URL. Takes precedence over url. */
    document?: PrefabState;
    basePath?: string;
    /** Immutable terrain: freeze world transforms after preparation. Remount to move or edit it. */
    static?: boolean;
    onChunkStatus?: (status: PrefabChunkStatus) => void;
    onChunkTiming?: (timing: PrefabChunkTiming) => void;
    onStatus?: (status: PrefabInstanceStatus) => void;
    onActivate?: () => void;
    children?: ReactNode;
}

export type PrefabChunkStatus = { id: string; phase: 'preparing' | 'ready' | 'unloaded' | 'error'; error?: unknown };
export type PrefabChunkTiming =
    | { id: string; phase: 'ready'; admittedAt: number; compilingAt: number; readyAt: number; shaders?: ShaderCompileTiming }
    | { id: string; phase: 'visible'; readyAt: number; visibleAt: number };

/** Load a shared definition, build an isolated instance, compile it, then activate gameplay. */
export function PrefabInstance(props: PrefabInstanceProps) {
    const parentPrefab = useContext(PrefabContext);
    const basePath = props.basePath ?? parentPrefab?.basePath ?? '';
    if (!props.document && !props.url) throw new Error('PrefabInstance requires a document or url.');
    return <SceneRuntime>
        <InstanceResource key={`${props.id}:${basePath}:${props.url}:${!!props.static}`} {...props} basePath={basePath} />
    </SceneRuntime>;
}

function InstanceResource(props: PrefabInstanceProps) {
    const runtime = useAssetRuntime();
    const source = props.document ?? props.url!;
    const inheritedSettings = useContext(ChunkSettingsContext);
    const parentScene = useContext(SceneContext);
    const settingsFor = (document: PrefabState) =>
        inheritedSettings ?? (!parentScene ? readChunkSettings(document.nodesById[document.rootId]) : null);
    const [resource, setResource] = useState<{ source: typeof source; prepared: PreparedPrefab } | null>(null);
    const latest = useRef({ onStatus: props.onStatus, settingsFor });
    latest.current = { onStatus: props.onStatus, settingsFor };
    useEffect(() => {
        const controller = new AbortController();
        latest.current.onStatus?.({ phase: 'loading' });
        void runtime.preparePrefab(source, { basePath: props.basePath, signal: controller.signal,
            deferMaterialTextures: props.static ? document => !!latest.current.settingsFor(document) : undefined,
        }).then(value => {
            if (controller.signal.aborted) return;
            startTransition(() => setResource({ source, prepared: value }));
        }, error => {
            if (!controller.signal.aborted) latest.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [props.basePath, props.static, source, runtime]);
    const prepared = resource?.source === source ? resource.prepared : null;
    if (!prepared) return null;
    const settings = props.static && settingsFor(prepared.document);
    if (settings) return <SpatialPrefabInstance {...props} prepared={prepared} options={settings} />;
    return <PreparedPrefabInstance {...props} document={prepared.document} />;
}
