import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, SkinnedMesh } from 'three';
import type { Group } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { scheduleObjectRaycast } from '../../../shared/raycast';
import { useCompileObject } from '../../../shared/GameCanvas';
import { useVisualAssetRevision } from '../assetRuntime';
import { useNode } from '../SceneContext';
import { usePrefabStore } from '../prefabStore';
import type { PrefabStoreState } from '../prefabStore';
import { findComponent } from '../types';
import { BooleanField, FieldGroup } from './Input';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';

type MergedMeshProperties = {
    enabled?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
};

type HiddenMesh = { mesh: Mesh; visible: boolean };

function MergedMeshEditor({ properties, update }: ComponentEditorProps<MergedMeshProperties>) {
    return (
        <FieldGroup>
            <BooleanField name="enabled" label="Merge Descendant Meshes" values={properties} onChange={update} fallback />
            <BooleanField name="castShadow" label="Cast Shadow" values={properties} onChange={update} fallback />
            <BooleanField name="receiveShadow" label="Receive Shadow" values={properties} onChange={update} fallback />
        </FieldGroup>
    );
}

function getIntendedVisibility(mesh: Mesh, hiddenMeshes: Map<Mesh, HiddenMesh>, nodesById: PrefabStoreState['nodesById']) {
    let object = mesh.parent;
    while (object) {
        const nodeId = object.userData.prefabNodeId;
        if (typeof nodeId === 'string') {
            const node = nodesById[nodeId];
            if (node?.hidden) return false;
            const meshComponent = findComponent(node, 'Mesh');
            if (meshComponent && meshComponent.properties?.visible === false) return false;
        }
        object = object.parent;
    }

    return hiddenMeshes.get(mesh)?.visible ?? mesh.visible;
}

function MergedMeshView({ properties, children }: ComponentViewProps<MergedMeshProperties>) {
    const groupRef = useRef<Group | null>(null);
    const mergedRef = useRef<Mesh | null>(null);
    const hiddenMeshes = useMemo(() => new Map<Mesh, HiddenMesh>(), []);
    const nodesById = usePrefabStore(state => state.nodesById);
    const childIdsById = usePrefabStore(state => state.childIdsById);
    const assetRevision = useVisualAssetRevision();
    const { editMode, nodeInteractionHandlers } = useNode();
    const enabled = properties.enabled !== false;

    useLayoutEffect(() => {
        const group = groupRef.current;
        if (!group) return;

        if (mergedRef.current) {
            group.remove(mergedRef.current);
            mergedRef.current.geometry.dispose();
            mergedRef.current = null;
        }

        if (!enabled) {
            hiddenMeshes.forEach(({ mesh, visible }) => { mesh.visible = visible; });
            hiddenMeshes.clear();
            return;
        }

        group.updateWorldMatrix(true, true);
        const rootInverse = group.matrixWorld.clone().invert();
        const geometries: BufferGeometry[] = [];
        const materials: Material[] = [];
        const sourceMeshes: Mesh[] = [];

        group.traverse(object => {
            if (!(object instanceof Mesh)
                || object === mergedRef.current
                || object instanceof SkinnedMesh
                || object instanceof InstancedMesh
                || object.userData.prefabMergedMesh) return;
            if (!getIntendedVisibility(object, hiddenMeshes, nodesById)) return;
            if (Array.isArray(object.material)) {
                console.warn('MergedMesh skipped a mesh with multiple source materials', object);
                return;
            }

            const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
            const relativeMatrix = new Matrix4().copy(object.matrixWorld).premultiply(rootInverse);
            geometry.applyMatrix4(relativeMatrix);
            geometries.push(geometry);
            materials.push(object.material);
            sourceMeshes.push(object);
        });

        const mergedGeometry = geometries.length ? mergeGeometries(geometries, true) : null;
        geometries.forEach(geometry => geometry.dispose());
        if (!mergedGeometry) return;

        const mergedMesh = new Mesh(mergedGeometry, materials);
        mergedMesh.name = 'Merged descendants';
        mergedMesh.castShadow = properties.castShadow !== false;
        mergedMesh.receiveShadow = properties.receiveShadow !== false;
        mergedMesh.userData.prefabMergedMesh = true;
        if (editMode || nodeInteractionHandlers) scheduleObjectRaycast(mergedMesh);
        group.add(mergedMesh);
        mergedRef.current = mergedMesh;

        sourceMeshes.forEach(mesh => {
            if (!hiddenMeshes.has(mesh)) {
                hiddenMeshes.set(mesh, { mesh, visible: mesh.visible });
            }
            mesh.visible = false;
        });
    }, [assetRevision, childIdsById, editMode, enabled, hiddenMeshes, nodeInteractionHandlers, nodesById, properties.castShadow, properties.receiveShadow]);
    useCompileObject(mergedRef, assetRevision);

    useLayoutEffect(() => () => {
        const group = groupRef.current;
        if (mergedRef.current) {
            group?.remove(mergedRef.current);
            mergedRef.current.geometry.dispose();
        }
        hiddenMeshes.forEach(({ mesh, visible }) => { mesh.visible = visible; });
        hiddenMeshes.clear();
    }, [hiddenMeshes]);

    return <group ref={groupRef}>{children}</group>;
}

const MergedMeshComponent: Component<MergedMeshProperties> = {
    name: 'MergedMesh',
    renderWhenDisabled: true,
    disableSiblingComposition: 'object',
    Editor: MergedMeshEditor,
    View: MergedMeshView,
    properties: {
        enabled: { type: 'boolean', default: true },
        castShadow: { type: 'boolean', default: true },
        receiveShadow: { type: 'boolean', default: true },
    },
};

export default MergedMeshComponent;
