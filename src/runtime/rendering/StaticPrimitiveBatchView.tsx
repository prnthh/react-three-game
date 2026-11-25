import { useEffect, useMemo } from 'react';
import { InstancedMesh } from 'three';
import { usePrimitiveGeometry } from '../components/GeometryComponent.js';
import MaterialComponent from '../components/MaterialComponent.js';
import type { StaticPrimitiveBatch } from '../prefabs/staticPrimitiveBatches.js';

const Material = MaterialComponent.View;

export function StaticPrimitiveBatchView({ batch }: { batch: StaticPrimitiveBatch }) {
    const geometry = usePrimitiveGeometry(batch.geometry);
    const mesh = useMemo(() => {
        const object = new InstancedMesh(geometry, [], batch.matrices.length / 16);
        object.instanceMatrix.array.set(batch.matrices);
        object.instanceMatrix.needsUpdate = true;
        object.castShadow = batch.geometry.castShadow !== false;
        object.receiveShadow = batch.geometry.receiveShadow !== false;
        object.frustumCulled = batch.geometry.frustumCulled !== false;
        object.computeBoundingSphere();
        return object;
    }, [batch, geometry]);
    useEffect(() => () => mesh.dispose(), [mesh]);
    return <primitive object={mesh} dispose={null}>
        <Material properties={batch.material} enabled />
    </primitive>;
}
