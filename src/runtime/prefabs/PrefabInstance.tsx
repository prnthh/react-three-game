import { AssetBoundary } from '../assets/AssetBoundary.js';
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { PrefabRoot } from './PrefabRoot.js';
import { createPrefabStore } from "../../core/prefabStore.js";
import { useAssetRuntime } from '../assets/AssetRuntime.js';
import { MeshInstanceProvider, useMeshInstanceRevision } from '../rendering/MeshInstanceProvider.js';
import { SceneRuntime } from '../SceneRuntime.js';
import type { PreparedPrefab } from './preparePrefab.js';
import { compileInSlices } from '../rendering/compileInSlices.js';
import { MountParentContext, usePendingMounts } from './ProgressiveMount.js';

export type PrefabInstanceStatus =
    | { phase: 'loading' }
    | { phase: 'compiling'; loadMs: number }
    | { phase: 'active'; loadMs: number; compileMs: number }
    | { phase: 'error'; error: unknown };

export interface PrefabInstanceProps {
    /** Unique placement identity within the enclosing scene. */
    id: string;
    url: string;
    basePath?: string;
    /** Immutable terrain: freeze world transforms after preparation. Remount to move or edit it. */
    static?: boolean;
    onStatus?: (status: PrefabInstanceStatus) => void;
    onActivate?: () => void;
    children?: ReactNode;
}

/** Load a shared definition, build an isolated instance, compile it, then activate gameplay. */
export function PrefabInstance(props: PrefabInstanceProps) {
    return <SceneRuntime><InstanceResource key={`${props.id}:${props.basePath ?? ''}:${props.url}:${!!props.static}`} {...props} /></SceneRuntime>;
}

function InstanceResource(props: PrefabInstanceProps) {
    const runtime = useAssetRuntime();
    const [prepared, setPrepared] = useState<PreparedPrefab | null>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    useEffect(() => {
        const controller = new AbortController();
        callbacks.current.onStatus?.({ phase: 'loading' });
        void runtime.preparePrefab(props.url, { basePath: props.basePath, signal: controller.signal }).then(value => {
            if (controller.signal.aborted) return;
            startTransition(() => setPrepared(value));
        }, error => {
            if (!controller.signal.aborted) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [props.basePath, props.url, runtime]);
    if (!prepared) return null;
    return <InstanceMount {...props} prepared={prepared} />;
}

function InstanceMount(props: PrefabInstanceProps & { prepared: PreparedPrefab }) {
    const container = useMemo(() => new Group(), []);
    const mountParent = useMemo(() => ({ current: container }), [container]);
    return <primitive object={container} visible={false} dispose={null}>
        <MountParentContext.Provider value={mountParent}>
            <MeshInstanceProvider isolated static={props.static}>
                <AssetBoundary atomic onError={error => props.onStatus?.({ phase: 'error', error })}>
                    <InstanceView {...props} container={container} />
                </AssetBoundary>
            </MeshInstanceProvider>
        </MountParentContext.Provider>
    </primitive>;
}

function InstanceView({ id, prepared, static: isStatic = false, basePath, onStatus, onActivate, children, container }: PrefabInstanceProps & { prepared: PreparedPrefab; container: Group }) {
    const store = useMemo(() => createPrefabStore(prepared.document), [prepared]);
    const { gl, camera, scene, invalidate } = useThree();
    const [compileMs, setCompileMs] = useState<number | null>(null);
    const compiled = compileMs !== null;
    const pendingMounts = usePendingMounts(!compiled);
    const revision = useMeshInstanceRevision(!compiled && !pendingMounts);
    const callbacks = useRef({ onStatus, onActivate });
    callbacks.current = { onStatus, onActivate };

    useEffect(() => {
        if (compiled || pendingMounts) return;
        const controller = new AbortController();
        callbacks.current.onStatus?.({ phase: 'compiling', loadMs: prepared.durationMs });
        const started = performance.now();
        void compileInSlices(gl as unknown as WebGPURenderer, container, camera, scene, { signal: controller.signal }).then(() => {
            if (controller.signal.aborted) return;
            if (isStatic) {
                container.updateWorldMatrix(true, true);
                container.traverse(object => {
                    object.matrixAutoUpdate = false;
                    object.matrixWorldAutoUpdate = false;
                });
            }
            setCompileMs(performance.now() - started);
            invalidate();
        }).catch(error => {
            if (!controller.signal.aborted) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [camera, compiled, container, isStatic, gl, invalidate, prepared, revision, scene, pendingMounts]);

    useEffect(() => {
        if (compileMs === null) return;
        callbacks.current.onStatus?.({ phase: 'active', loadMs: prepared.durationMs, compileMs });
        callbacks.current.onActivate?.();
    }, [compiled, compileMs, prepared]);

    useEffect(() => { container.visible = compiled; invalidate(); }, [compiled, container, invalidate]);

    return <PrefabRoot id={id} store={store} basePath={basePath} enabled={compiled}>{children}</PrefabRoot>;
}
