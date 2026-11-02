import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { AssetBoundary } from '../assets/AssetBoundary.js';
import { MeshInstanceProvider, useMeshInstanceRevision } from '../rendering/MeshInstanceProvider.js';
import { compileInSlices } from '../rendering/compileInSlices.js';
import { createPrefabStore } from '../../core/prefabStore.js';
import { PrefabRoot } from './PrefabRoot.js';
import type { PreparedPrefab } from './preparePrefab.js';
import type { PrefabInstanceProps } from './PrefabInstance.js';
import { SceneContext } from '../scene/SceneContext.js';
import { readChunkSettings } from '../components/ChunkSettingsComponent.js';

export function PreparedPrefabInstance(props: PrefabInstanceProps & { prepared: PreparedPrefab; spatialCellSize?: number | null }) {
    const container = useMemo(() => new Group(), []);
    const parentScene = useContext(SceneContext);
    const rootSettings = !parentScene ? readChunkSettings(props.prepared.document.nodesById[props.prepared.document.rootId]) : null;
    const cellSize = props.spatialCellSize === undefined ? rootSettings?.batchCellSize : props.spatialCellSize;
    return <primitive object={container} visible={false} dispose={null}>
        <MeshInstanceProvider isolated static={props.static} spatialCellSize={cellSize}>
            <AssetBoundary atomic onError={error => props.onStatus?.({ phase: 'error', error })}>
                <InstanceView {...props} container={container} />
            </AssetBoundary>
        </MeshInstanceProvider>
    </primitive>;
}

type InstanceViewProps = PrefabInstanceProps & { prepared: PreparedPrefab; container: Group };

function InstanceView(props: InstanceViewProps) {
    const store = useMemo(() => createPrefabStore(props.prepared.document), [props.prepared]);
    const [compiled, setCompiled] = useState(false);
    return <PrefabRoot id={props.id} store={store} basePath={props.basePath} enabled={compiled}>
        <InstancePreparation {...props} compiled={compiled} setCompiled={setCompiled} />
        {props.children}
    </PrefabRoot>;
}

function InstancePreparation({ prepared, static: isStatic = false, onStatus, onActivate, container, compiled, setCompiled }: InstanceViewProps & {
    compiled: boolean;
    setCompiled: (compiled: boolean) => void;
}) {
    const { gl, camera, scene, invalidate } = useThree();
    const revision = useMeshInstanceRevision(!compiled);
    const callbacks = useRef({ onStatus, onActivate });
    callbacks.current = { onStatus, onActivate };

    useEffect(() => {
        // Compile the materialized batches after their first frame, not the source meshes.
        if (compiled || revision === 0) return;
        const controller = new AbortController();
        callbacks.current.onStatus?.({ phase: 'compiling' });
        void compileInSlices(gl as unknown as WebGPURenderer, container, camera, scene, {
            signal: controller.signal,
        }).then(() => {
            if (controller.signal.aborted) return;
            if (isStatic) {
                container.updateWorldMatrix(true, true);
                container.traverse(object => {
                    object.matrixAutoUpdate = false;
                    object.matrixWorldAutoUpdate = false;
                });
            }
            setCompiled(true);
            invalidate();
        }).catch(error => {
            if (!controller.signal.aborted) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [camera, compiled, container, isStatic, gl, invalidate, prepared, revision, scene]);

    useEffect(() => {
        container.visible = compiled;
        invalidate();
        if (!compiled) return;
        callbacks.current.onStatus?.({ phase: 'active' });
        callbacks.current.onActivate?.();
    }, [compiled, container, invalidate]);

    return null;
}
