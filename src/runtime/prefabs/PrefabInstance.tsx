import { startTransition, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import { SceneRuntime } from '../SceneRuntime.js';
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
    /** Immutable scenery. Prepared objects retain their local transforms and follow the placement. */
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
export function PrefabInstance({ url, document, basePath: providedBasePath, ...props }: PrefabInstanceProps) {
    const parentPrefab = useContext(PrefabContext);
    const basePath = providedBasePath ?? parentPrefab?.basePath ?? '';
    const source = document ?? url;
    if (!source) throw new Error('PrefabInstance requires a document or url.');
    return <SceneRuntime>
        <InstanceResource key={JSON.stringify([props.id, basePath, typeof source === 'string' ? source : null, !!props.static])} {...props} source={source} basePath={basePath} />
    </SceneRuntime>;
}

function InstanceResource({ source, static: isStatic, onChunkStatus, onChunkTiming, ...placement }:
    Omit<PrefabInstanceProps, 'url' | 'document'> & { source: string | PrefabState }) {
    const runtime = useAssetRuntime();
    const inheritedSettings = useContext(ChunkSettingsContext);
    const parentScene = useContext(SceneContext);
    const settingsFor = (document: PrefabState) =>
        inheritedSettings ?? (!parentScene ? readChunkSettings(document.nodesById[document.rootId]) : null);
    const [resource, setResource] = useState<{ source: typeof source; document: PrefabState } | null>(null);
    const latest = useRef({ onStatus: placement.onStatus, settingsFor });
    latest.current = { onStatus: placement.onStatus, settingsFor };
    useEffect(() => {
        const controller = new AbortController();
        latest.current.onStatus?.({ phase: 'loading' });
        void runtime.preparePrefab(source, { basePath: placement.basePath, signal: controller.signal,
            deferMaterialTextures: isStatic ? document => !!latest.current.settingsFor(document) : undefined,
        }).then(value => {
            if (controller.signal.aborted) return;
            startTransition(() => setResource({ source, document: value.document }));
        }, error => {
            if (!controller.signal.aborted) latest.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [placement.basePath, isStatic, source, runtime]);
    if (resource?.source !== source) return null;
    const { document } = resource;
    const settings = isStatic && settingsFor(document);
    if (settings) return <SpatialPrefabInstance {...placement} document={document} options={settings}
        onChunkStatus={onChunkStatus} onChunkTiming={onChunkTiming} />;
    return <PreparedPrefabInstance {...placement} document={document} static={isStatic} />;
}
