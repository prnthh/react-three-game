import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import { PlacementGroup } from './PlacementGroup.js';
import type { WebGPURenderer } from 'three/webgpu';
import { AssetBoundary } from '../assets/AssetBoundary.js';
import { MeshInstanceProvider, useMeshInstanceRevision } from '../rendering/MeshInstanceProvider.js';
import { compileInSlices, type ShaderCompileTiming } from '../rendering/compileInSlices.js';
import { createPrefabStore } from '../../core/prefabStore.js';
import type { PrefabState } from '../../core/prefab.js';
import { PrefabRoot } from './PrefabRoot.js';
import type { PrefabInstanceProps } from './PrefabInstance.js';
import { PrefabEditorMode, SceneContext } from '../scene/SceneContext.js';
import { readChunkSettings } from '../components/ChunkSettingsComponent.js';

type InstanceContentProps = Pick<PrefabInstanceProps, 'id' | 'basePath' | 'onStatus' | 'onActivate' | 'children'> & {
    document: PrefabState;
    onShaderTiming?: (timing: ShaderCompileTiming) => void;
};

export function PreparedPrefabInstance({ streamGroup, static: isStatic = !!streamGroup, ...props }:
    InstanceContentProps & { streamGroup?: PlacementGroup; static?: boolean }) {
    const container = useMemo(() => streamGroup ?? (isStatic ? new PlacementGroup() : new Group()), [streamGroup, isStatic]);
    const parentScene = useContext(SceneContext);
    const rootSettings = !parentScene ? readChunkSettings(props.document.nodesById[props.document.rootId]) : null;
    // A streamed cell is already bounded. Keep neighboring meshes in one batch.
    const cellSize = streamGroup ? null : rootSettings?.batchCellSize;
    const editing = parentScene?.mode === PrefabEditorMode.Edit;
    return <primitive object={container} matrixAutoUpdate={!isStatic || !!streamGroup} visible={false} dispose={null}>
        <MeshInstanceProvider isolated static={isStatic && !editing} spatialCellSize={cellSize}>
            <AssetBoundary atomic onError={error => props.onStatus?.({ phase: 'error', error })}>
                <InstanceView {...props} container={container} streamed={!!streamGroup} editing={editing} />
            </AssetBoundary>
        </MeshInstanceProvider>
    </primitive>;
}

function InstanceView({
    id, basePath, children, document, streamed, onStatus, onActivate, onShaderTiming, container, editing,
}: InstanceContentProps & { container: Group; streamed: boolean; editing: boolean }) {
    const store = useMemo(() => createPrefabStore(document), [document]);
    const [compiled, setCompiled] = useState(false);
    const gl = useThree(state => state.gl);
    const camera = useThree(state => state.camera);
    const scene = useThree(state => state.scene);
    const invalidate = useThree(state => state.invalidate);
    const revision = useMeshInstanceRevision(!compiled);
    useLayoutEffect(() => {
        if (compiled && !editing && container instanceof PlacementGroup) return container.sleep();
    }, [compiled, editing, container]);
    const callbacks = useRef({ onStatus, onActivate, onShaderTiming });
    callbacks.current = { onStatus, onActivate, onShaderTiming };

    useEffect(() => {
        // Compile the materialized batches after their first frame, not the source meshes.
        if (compiled || revision === 0) return;
        const controller = new AbortController();
        callbacks.current.onStatus?.({ phase: 'compiling' });
        void compileInSlices(gl as unknown as WebGPURenderer, container, camera, scene, {
            signal: controller.signal,
            onTiming: callbacks.current.onShaderTiming,
            // A streamed cell has already waited for a frame to build its batches.
            yieldBeforeFirstSlice: !streamed,
        }).then(() => {
            if (controller.signal.aborted) return;
            setCompiled(true);
        }).catch(error => {
            if (!controller.signal.aborted) callbacks.current.onStatus?.({ phase: 'error', error });
        });
        return () => controller.abort();
    }, [camera, compiled, container, gl, document, revision, scene, streamed]);

    useEffect(() => {
        if (!streamed) container.visible = compiled;
        invalidate();
        if (!compiled) return;
        callbacks.current.onStatus?.({ phase: 'active' });
        callbacks.current.onActivate?.();
    }, [compiled, container, invalidate, streamed]);

    // Stream groups only contain static visuals. Their group controls presentation;
    // only a resident prefab needs a gameplay activation render after compilation.
    return <PrefabRoot id={id} store={store} basePath={basePath} enabled={streamed || compiled}>{children}</PrefabRoot>;
}
