import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Euler, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useGameObject } from '../scene/SceneContext.js';
import { getObjectNodeIdentity, resolveGameObject } from '../scene/gameObject.js';
import MaterialComponent, { MaterialOverridesProvider } from './MaterialComponent.js';

type DecalProperties = {
    texture: string;
    color: string;
    opacity: number;
    size: [number, number, number];
    depthBias: number;
    renderOrder: number;
};

/** Only the owning node's surfaces: never project onto child nodes or other decals. */
export function getDecalTargets(parent: Object3D, meshes: Mesh[] = []): Mesh[] {
    meshes.length = 0;
    const visit = (object: Object3D) => {
        if (object !== parent && getObjectNodeIdentity(object)) return;
        if (object instanceof Mesh && !('isSkinnedMesh' in object) && !('isInstancedMesh' in object)
            && object.geometry.getAttribute('position')) meshes.push(object);
        object.children.forEach(visit);
    };
    visit(parent);
    return meshes;
}

/** Project in decal-local space, preserving nested scale/rotation without mutating source meshes. */
export function projectDecalGeometry(targets: Mesh[], projector: Object3D, size: [number, number, number]): BufferGeometry {
    if (size.length !== 3 || size.some(value => !Number.isFinite(value) || value <= 0)) return new BufferGeometry();
    projector.updateWorldMatrix(true, false);
    if (Math.abs(projector.matrixWorld.determinant()) < 1e-12) return new BufferGeometry();
    const inverse = projector.matrixWorld.clone().invert();
    const parts: BufferGeometry[] = [];
    for (const mesh of targets) {
        mesh.updateWorldMatrix(true, false);
        const proxy = new Mesh(mesh.geometry, mesh.material);
        proxy.matrixWorld.multiplyMatrices(inverse, mesh.matrixWorld);
        const part = new DecalGeometry(proxy, new Vector3(), new Euler(), new Vector3(...size));
        if (!part.getAttribute('normal')) part.computeVertexNormals();
        parts.push(part);
    }
    if (parts.length === 1) return parts[0];
    try { return parts.length ? mergeGeometries(parts) ?? new BufferGeometry() : new BufferGeometry(); }
    finally { parts.forEach(part => part.dispose()); }
}

type SurfaceState = {
    target: Mesh;
    geometry: BufferGeometry;
    position: BufferGeometry['attributes'][string];
    normal: BufferGeometry['attributes'][string] | undefined;
    index: BufferGeometry['index'];
    positionVersion: number | undefined;
    normalVersion: number | undefined;
    indexVersion: number | undefined;
    matrix: Matrix4;
};
function attributeVersion(attribute: BufferGeometry['attributes'][string] | undefined) {
    return attribute && ('version' in attribute ? attribute.version : attribute.data.version);
}

const MaterialView = MaterialComponent.View;
function DecalView({ properties: p, children }: ComponentViewProps<DecalProperties>) {
    const owner = useGameObject();
    const output = useRef<Mesh>(null);
    const cache = useMemo(() => ({ targets: [] as Mesh[], surfaces: [] as SurfaceState[], size: [] as number[] }), []);
    const inverse = useMemo(() => new Matrix4(), []);
    const relative = useMemo(() => new Matrix4(), []);
    // Cached surface state catches async model replacement and direct runtime edits.
    // Geometry is generated only when the projector/target relationship changes, not per frame.
    const rebuild = () => {
        const projector = owner.transform, mesh = output.current;
        if (!projector || !mesh) return;
        const parent = projector.parent && resolveGameObject(projector.parent)?.transform;
        const targets = cache.targets;
        if (parent) getDecalTargets(parent, targets);
        else targets.length = 0;
        projector.updateWorldMatrix(true, false);
        inverse.copy(projector.matrixWorld).invert();
        let changed = cache.surfaces.length !== targets.length || p.size.some((value, i) => value !== cache.size[i]);
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            target.updateWorldMatrix(true, false);
            relative.multiplyMatrices(inverse, target.matrixWorld);
            const geometry = target.geometry;
            const { position, normal } = geometry.attributes;
            const index = geometry.index;
            const positionVersion = attributeVersion(position);
            const normalVersion = attributeVersion(normal);
            const indexVersion = index?.version;
            const old = cache.surfaces[i];
            // Parent motion introduces tiny numerical differences, not a new projection.
            const surfaceChanged = !old || old.target !== target || old.geometry !== geometry
                || old.position !== position || old.normal !== normal || old.index !== index
                || old.positionVersion !== positionVersion || old.normalVersion !== normalVersion || old.indexVersion !== indexVersion
                || relative.elements.some((value, axis) => Math.abs(value - old.matrix.elements[axis]) > 1e-7);
            if (surfaceChanged) {
                cache.surfaces[i] = { target, geometry, position, normal, index, positionVersion, normalVersion, indexVersion, matrix: relative.clone() };
                changed = true;
            }
        }
        if (!changed) return;
        cache.surfaces.length = targets.length;
        cache.size = [...p.size];
        const geometry = projectDecalGeometry(targets, projector, p.size);
        const old = mesh.geometry;
        mesh.geometry = geometry;
        old.dispose();
    };
    useFrame(rebuild);
    useEffect(() => { rebuild(); });
    useEffect(() => {
        const mesh = output.current;
        return () => { mesh?.geometry.dispose(); cache.size.length = 0; cache.surfaces.length = 0; };
    }, []);
    const overrides = useMemo(() => ({ polygonOffset: true, polygonOffsetFactor: -p.depthBias,
        polygonOffsetUnits: -p.depthBias }), [p.depthBias]);
    const material = useMemo(() => ({ texture: p.texture, color: p.color, opacity: p.opacity,
        transparent: true, depthWrite: false, depthTest: true, roughness: 0.95 }), [p.texture, p.color, p.opacity]);
    return <>
        <mesh ref={output} renderOrder={p.renderOrder} receiveShadow dispose={null}>
            <MaterialOverridesProvider overrides={overrides} cacheKey={`decal:${p.depthBias}`}>
                <MaterialView properties={material} enabled />
            </MaterialOverridesProvider>
        </mesh>
        {children}
    </>;
}
const DecalComponent: Component<DecalProperties> = {
    name: 'Decal',
    renderWhenDisabled: true,
    description: 'Projects an alpha image onto the parent node’s static meshes using Three.js DecalGeometry. Add as a child of a Geometry or Model node. Transform positions/orients the projector; size sets width, height and projection depth. No collision; not for skinned or instanced meshes.',
    dependencies: p => p.texture ? [{ kind: 'texture', path: p.texture }] : [],
    View: DecalView,
    properties: {
        texture: { type: 'string', default: '', description: 'Transparent decal image relative to prefab basePath.' },
        color: { type: 'color', default: '#ffffff' },
        opacity: { default: 1, min: 0, max: 1, step: 0.05 },
        size: { type: 'vector3', default: [1, 1, 0.5], description: 'Projector width, height and depth in local units. Keep depth shallow to avoid the opposite side of thin objects.' },
        depthBias: { default: 2, min: 0, max: 10, step: 0.5 },
        renderOrder: { default: 1, step: 1 },
    },
};
export default DecalComponent;
