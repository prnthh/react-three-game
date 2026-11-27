import { useEffect, useMemo } from 'react';
import { InstancedMesh, Mesh } from 'three';
import { usePrimitiveGeometry } from '../components/GeometryComponent.js';
import { PrefabMaterialView } from '../components/MaterialComponent.js';
import type { StaticPrimitiveBatch } from '../prefabs/staticPrimitiveBatches.js';

export function StaticPrimitiveBatchView({ batch, basePath = '' }: { batch: StaticPrimitiveBatch; basePath?: string }) {
    const geometry = usePrimitiveGeometry(batch.geometry);
    const mesh = useMemo(() => {
        const count = batch.matrices.length / 16;
        const object = count === 1 ? new Mesh(geometry, []) : new InstancedMesh(geometry, [], count);
        if (object instanceof InstancedMesh) {
            object.instanceMatrix.array.set(batch.matrices);
            object.instanceMatrix.needsUpdate = true;
            object.computeBoundingSphere();
        } else {
            object.name = batch.name ?? '';
            object.matrix.fromArray(batch.matrices);
            object.matrixAutoUpdate = false;
            object.matrixWorldNeedsUpdate = true;
        }
        object.castShadow = batch.geometry.castShadow !== false;
        object.receiveShadow = batch.geometry.receiveShadow !== false;
        object.frustumCulled = batch.geometry.frustumCulled !== false;
        return object;
    }, [batch, geometry]);
    useEffect(() => () => {
        if (!(mesh instanceof InstancedMesh)) return;
        // A whole tile can retire at once. Let detached instance buffers drain
        // between draws; a Strict Mode effect replay can reattach the same mesh.
        const dispose = () => { if (!mesh.parent) mesh.dispose(); };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(dispose, { timeout: 1000 });
        else setTimeout(dispose, 0);
    }, [mesh]);
    return <primitive object={mesh} dispose={null}>
        <PrefabMaterialView properties={batch.material} basePath={basePath} />
    </primitive>;
}
