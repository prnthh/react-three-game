import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { AssetBoundary } from '../assets/AssetBoundary.js';
import { MeshInstanceProvider, useMeshInstanceRevision } from '../rendering/MeshInstanceProvider.js';
import { compileInSlices } from '../rendering/compileInSlices.js';
import { createPrefabStore } from '../../core/prefabStore.js';
import type { PrefabState } from '../../core/prefab.js';
import { PrefabRoot } from './PrefabRoot.js';
import type { PrefabInstanceProps } from './PrefabInstance.js';
import { SceneContext } from '../scene/SceneContext.js';
import { readChunkSettings } from '../components/ChunkSettingsComponent.js';

type PreparedInstanceProps = Pick<PrefabInstanceProps, 'id' | 'basePath' | 'static' | 'onStatus' | 'onActivate' | 'children'> & {
    document: PrefabState;
    streamGroup?: Group;
};

export function PreparedPrefabInstance(props: PreparedInstanceProps) {
    const container = useMemo(() => props.streamGroup ?? new Group(), [props.streamGroup]);
    const parentScene = useContext(SceneContext);
    const rootSettings = !parentScene ? readChunkSettings(props.document.nodesById[props.document.rootId]) : null;
    // A streamed cell is already bounded. Keep neighboring meshes in one batch.
    const cellSize = props.streamGroup ? null : rootSettings?.batchCellSize;
    return <primitive object={container} visible={false} dispose={null}>
        <MeshInstanceProvider isolated static={props.static} spatialCellSize={cellSize}>
            <AssetBoundary atomic onError={error => props.onStatus?.({ phase: 'error', error })}>
                <InstanceView {...props} container={container} />
            </AssetBoundary>
        </MeshInstanceProvider>
    </primitive>;
}

function InstanceView({
    id, basePath, children, document, streamGroup, static: isStatic = false, onStatus, onActivate, container,
}: PreparedInstanceProps & { container: Group }) {
    const store = useMemo(() => createPrefabStore(document), [document]);
    const [compiled, setCompiled] = useState(false);
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
    }, [camera, compiled, container, isStatic, gl, invalidate, document, revision, scene]);

    useEffect(() => {
        if (!streamGroup) container.visible = compiled;
        invalidate();
        if (!compiled) return;
        callbacks.current.onStatus?.({ phase: 'active' });
        callbacks.current.onActivate?.();
    }, [compiled, container, invalidate, streamGroup]);

    return <PrefabRoot id={id} store={store} basePath={basePath} enabled={compiled}>{children}</PrefabRoot>;
}
