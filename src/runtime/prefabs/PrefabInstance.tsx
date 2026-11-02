import { startTransition, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import { SceneRuntime } from '../SceneRuntime.js';
import type { PreparedPrefab } from './preparePrefab.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import { SpatialPrefabInstance } from './SpatialPrefabInstance.js';
import { ChunkSettingsContext, readChunkSettings } from '../components/ChunkSettingsComponent.js';
import { SceneContext } from '../scene/SceneContext.js';
import type { PrefabState } from '../../core/prefab.js';

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
    onStatus?: (status: PrefabInstanceStatus) => void;
    onActivate?: () => void;
    children?: ReactNode;
}

export type PrefabChunkStatus = { id: string; phase: 'preparing' | 'ready' | 'unloaded' | 'error'; error?: unknown };

/** Load a shared definition, build an isolated instance, compile it, then activate gameplay. */
export function PrefabInstance(props: PrefabInstanceProps) {
    if (!props.document && !props.url) throw new Error('PrefabInstance requires a document or url.');
    return <SceneRuntime>
        <InstanceResource key={`${props.id}:${props.basePath ?? ''}:${props.url}:${!!props.static}`} {...props} />
    </SceneRuntime>;
}

function InstanceResource(props: PrefabInstanceProps) {
    const runtime = useAssetRuntime();
    const source = props.document ?? props.url!;
    const inheritedSettings = useContext(ChunkSettingsContext);
    const parentScene = useContext(SceneContext);
    const [resource, setResource] = useState<{ source: typeof source; prepared: PreparedPrefab } | null>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    useEffect(() => {
        const controller = new AbortController();
        callbacks.current.onStatus?.({ phase: 'loading' });
        void runtime.preparePrefab(source, { basePath: props.basePath, signal: controller.signal }).then(value => {
            if (controller.signal.aborted) return;
            startTransition(() => setResource({ source, prepared: value }));
        }, error => {
            if (!controller.signal.aborted) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [props.basePath, source, runtime]);
    const prepared = resource?.source === source ? resource.prepared : null;
    const settings = useMemo(() => inheritedSettings ?? (!parentScene && prepared ? readChunkSettings(prepared.document.nodesById[prepared.document.rootId]) : null), [inheritedSettings, parentScene, prepared]);
    if (!prepared) return null;
    if (props.static && settings) return <SpatialPrefabInstance {...props} prepared={prepared} options={settings} />;
    return <PreparedPrefabInstance {...props} prepared={prepared} />;
}
