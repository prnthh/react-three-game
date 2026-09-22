import { MaterialPoolProvider, useSceneMaterialStatus } from "../tools/prefabeditor/components/MaterialComponent";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { PrefabRoot } from '../tools/prefabeditor/PrefabRoot';
import { createPrefabStore } from '../tools/prefabeditor/prefabStore';
import { AssetRuntimeProvider, useAssetRuntime, useScenePendingLoads } from '../tools/prefabeditor/assetRuntime';
import { MeshInstanceProvider, useMeshInstanceRevision } from '../tools/prefabeditor/MeshInstanceProvider';
import { RuntimeNodeIdScope } from '../tools/prefabeditor/SceneContext';
import type { PreparedPrefab } from './preparePrefab';

export type PrefabInstanceStatus =
    | { phase: 'loading' }
    | { phase: 'compiling'; loadMs: number }
    | { phase: 'ready' | 'active'; loadMs: number; compileMs: number }
    | { phase: 'error'; error: unknown };

export interface PrefabInstanceProps {
    /** Unique placement identity within the enclosing scene. */
    id: string;
    url: string;
    basePath?: string;
    active?: boolean;
    /** Immutable terrain: freeze world transforms after preparation. Remount to move or edit it. */
    static?: boolean;
    onStatus?: (status: PrefabInstanceStatus) => void;
    onActivate?: () => void;
    children?: ReactNode;
}

/** Load a shared definition, build an isolated instance, compile it, then activate gameplay. */
export function PrefabInstance(props: PrefabInstanceProps) {
    return <AssetRuntimeProvider><MaterialPoolProvider><InstanceResource key={`${props.id}:${props.basePath ?? ''}:${props.url}:${!!props.static}`} {...props} /></MaterialPoolProvider></AssetRuntimeProvider>;
}

function InstanceResource(props: PrefabInstanceProps) {
    const runtime = useAssetRuntime();
    const [prepared, setPrepared] = useState<PreparedPrefab | null>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    useEffect(() => {
        const controller = new AbortController();
        let resource: PreparedPrefab | undefined;
        callbacks.current.onStatus?.({ phase: 'loading' });
        void runtime.preparePrefab(props.url, { basePath: props.basePath, signal: controller.signal }).then(value => {
            if (controller.signal.aborted) { value.release(); return; }
            resource = value;
            setPrepared(value);
        }, error => {
            if (!controller.signal.aborted) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => { controller.abort(); resource?.release(); };
    }, [props.basePath, props.url, runtime]);
    if (!prepared) return null;
    return <RuntimeNodeIdScope prefix={props.id}>
        <InstanceMount {...props} prepared={prepared} />
    </RuntimeNodeIdScope>;
}

// Three's compiler temporarily changes renderer state; serialize preparation per renderer.
const compilationQueues = new WeakMap<object, Promise<unknown>>();
function enqueueCompilation(renderer: WebGPURenderer, compile: () => Promise<void>) {
    const previous = compilationQueues.get(renderer) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(compile);
    compilationQueues.set(renderer, next);
    void next.finally(() => {
        if (compilationQueues.get(renderer) === next) compilationQueues.delete(renderer);
    }).catch(() => {});
    return next;
}

function InstanceMount(props: PrefabInstanceProps & { prepared: PreparedPrefab }) {
    const container = useMemo(() => new Group(), []);
    return <primitive object={container} visible={false} dispose={null}>
        <MeshInstanceProvider isolated static={props.static}><InstanceView {...props} container={container} /></MeshInstanceProvider>
    </primitive>;
}

function InstanceView({ prepared, active = true, static: isStatic = false, basePath, onStatus, onActivate, children, container }: PrefabInstanceProps & { prepared: PreparedPrefab; container: Group }) {
    const store = useMemo(() => createPrefabStore(prepared.document), [prepared]);
    const { gl, camera, scene, invalidate } = useThree();
    const revision = useMeshInstanceRevision();
    const pendingLoads = useScenePendingLoads();
    const { revision: materialRevision, pending: pendingMaterials } = useSceneMaterialStatus();
    const [compiled, setCompiled] = useState(false);
    const [compileMs, setCompileMs] = useState(0);
    const callbacks = useRef({ onStatus, onActivate });
    callbacks.current = { onStatus, onActivate };

    useEffect(() => {
        if (compiled || pendingLoads > 0 || pendingMaterials > 0) return;
        let cancelled = false;
        callbacks.current.onStatus?.({ phase: 'compiling', loadMs: prepared.durationMs });
        void enqueueCompilation(gl as unknown as WebGPURenderer, async () => {
            if (cancelled) return;
            const started = performance.now();
            // Projection happens synchronously before compileAsync awaits its pipelines.
            // Restore visibility immediately so staging never appears in a normal frame.
            const visible = container.visible;
            container.visible = true;
            container.updateWorldMatrix(true, true);
            let work: Promise<void>;
            try { work = (gl as unknown as WebGPURenderer).compileAsync(container, camera, scene); }
            finally { container.visible = visible; }
            await work;
            if (cancelled) return;
            if (isStatic) {
                container.updateWorldMatrix(true, true);
                container.traverse(object => {
                    object.matrixAutoUpdate = false;
                    object.matrixWorldAutoUpdate = false;
                });
            }
            setCompileMs(performance.now() - started);
            setCompiled(true);
            invalidate();
        }).catch(error => {
            if (!cancelled) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => { cancelled = true; };
    }, [camera, compiled, container, isStatic, gl, invalidate, pendingLoads, pendingMaterials, materialRevision, prepared, revision, scene]);

    useEffect(() => {
        if (!compiled) return;
        callbacks.current.onStatus?.({ phase: active ? 'active' : 'ready', loadMs: prepared.durationMs, compileMs });
        if (active) callbacks.current.onActivate?.();
    }, [active, compiled, compileMs, prepared]);

    useEffect(() => { container.visible = compiled && active; invalidate(); }, [active, compiled, container, invalidate]);

    return <>
        <PrefabRoot store={store} basePath={basePath} enabled={compiled && active} preparing={!compiled} />
        {children}
    </>;
}
