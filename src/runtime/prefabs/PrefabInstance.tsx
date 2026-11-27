import { useCallback, useContext, useRef, type ReactNode } from 'react';
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import { SceneRuntime } from '../SceneRuntime.js';
import { usePrefabPreparation } from './usePrefabPreparation.js';
import { PreparedPrefabInstance } from './PreparedPrefabInstance.js';
import { SpatialPrefabInstance } from './SpatialPrefabInstance.js';
import { ChunkSettingsContext, readChunkSettings } from '../components/ChunkSettingsComponent.js';
import { PrefabContext, SceneContext } from '../scene/SceneContext.js';
import type { PrefabState } from '../../core/prefab.js';

export type PrefabInstanceStatus =
    | { phase: 'loading' }
    | { phase: 'compiling' }
    | { phase: 'active' }
    | { phase: 'error'; error: unknown; cellId?: string };

export interface PrefabInstanceProps {
    /** Unique placement identity within the enclosing scene. */
    id: string;
    /** URL or normalized prefab definition to prepare for this placement. */
    source: string | PrefabState;
    basePath?: string;
    /** Immutable scenery. Prepared objects retain their local transforms and follow the placement. */
    static?: boolean;
    onChunkTiming?: (timing: PrefabChunkTiming) => void;
    onStatus?: (status: PrefabInstanceStatus) => void;
    children?: ReactNode;
}

/** Reported once when a streamed cell finishes preparation. */
export interface PrefabChunkTiming {
    id: string;
    admittedAt: number;
    compilingAt: number;
    readyAt: number;
}

/** Load a shared definition, build an isolated instance, compile it, then activate gameplay. */
export function PrefabInstance({ source, basePath: providedBasePath, ...props }: PrefabInstanceProps) {
    const parentPrefab = useContext(PrefabContext);
    const basePath = providedBasePath ?? parentPrefab?.basePath ?? '';
    if (!source) throw new Error('PrefabInstance requires a prefab source.');
    return <SceneRuntime>
        <InstanceResource key={JSON.stringify([props.id, basePath, typeof source === 'string' ? source : null, !!props.static])}
            {...props} source={source} basePath={basePath} />
    </SceneRuntime>;
}

function InstanceResource({ source, static: isStatic, onChunkTiming, ...placement }: PrefabInstanceProps) {
    const runtime = useAssetRuntime();
    const inheritedSettings = useContext(ChunkSettingsContext);
    const standalone = !useContext(SceneContext);
    const settingsFor = (document: PrefabState) =>
        inheritedSettings ?? (standalone ? readChunkSettings(document.nodesById[document.rootId]) : null);
    // A settings edit can repartition an already prepared document.
    const currentSettings = useRef(settingsFor);
    currentSettings.current = settingsFor;
    const { basePath } = placement;
    const prepare = useCallback((signal: AbortSignal) => runtime.preparePrefab(source, {
        basePath, signal, deferMaterialTextures: isStatic ? document => !!currentSettings.current(document) : undefined,
    }), [runtime, source, basePath, isStatic]);
    const document = usePrefabPreparation(prepare, 'loading', placement.onStatus);
    if (!document) return null;
    const settings = isStatic && settingsFor(document);
    if (settings) return <SpatialPrefabInstance {...placement} document={document} options={settings}
        onChunkTiming={onChunkTiming} />;
    return <PreparedPrefabInstance {...placement} document={document} static={isStatic} />;
}
