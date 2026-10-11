import { useLayoutEffect, useMemo, useState } from 'react';
import { Box3, BoxGeometry, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { createNodeComponentType, findComponent, useSceneComponents, useNode, useGameObject, usePrefab, useRegisterNodeComponent, useSharedGeometryResource, useSharedMaterialResource, type Component, type ComponentViewProps, type GameObject } from 'react-three-game/viewer';
import { CollisionWorld, type Surface } from '../collision';

type CollisionSurface = { belongsTo(root: Object3D | null): boolean; bounds(): Surface | null };
export const COLLISION_SURFACE = createNodeComponentType<CollisionSurface>('CollisionSurface');
type BoxSize = [number, number, number];

/** Collision dimensions come only from the authored box geometry. */
export function resolveCollisionSurfaceSize(node: GameObject | null): BoxSize | null {
    const geometry = findComponent(node, 'Geometry');
    if (!geometry || (geometry.properties.geometryType ?? 'box') !== 'box') return null;
    const args = geometry.properties.args;
    if (!Array.isArray(args) || args.length < 3
        || !args.slice(0, 3).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) return null;
    return [args[0], args[1], args[2]];
}

function ColliderWireframe({ size }: { size: BoxSize }) {
    const geometry = useSharedGeometryResource(`parkour:collision:${size.join(',')}`, () => new BoxGeometry(...size));
    const material = useSharedMaterialResource('parkour:collision-wireframe', () => new MeshBasicMaterial({
        color: '#52f5a5', depthWrite: false, toneMapped: false, wireframe: true,
    }));
    return <mesh raycast={() => {}} renderOrder={1000} userData={{ editorHelper: true }}>
        <primitive object={geometry} attach="geometry" dispose={null} />
        <primitive object={material} attach="material" dispose={null} />
    </mesh>;
}

function CollisionSurfaceView({ children, enabled }: ComponentViewProps) {
    const object = useGameObject();
    const prefab = usePrefab();
    const { editMode, nodeId } = useNode();
    const size = resolveCollisionSurfaceSize(prefab.get(nodeId));
    const capability = useMemo(() => ({ belongsTo(root: Object3D | null) {
        if (!root) return false;
        for (let parent = object.transform; parent; parent = parent.parent) {
            if (parent === root) return true;
        }
        return false;
    }, bounds() {
        const transform = object.transform;
        if (!transform || !size) return null;
        transform.updateWorldMatrix(true, false);
        const center = new Vector3();
        const rotation = new Quaternion();
        const scale = new Vector3();
        transform.matrixWorld.decompose(center, rotation, scale);
        const half = new Vector3(...size).multiplyScalar(0.5);
        const orientedHalf = new Vector3(
            Math.abs(half.x * scale.x), Math.abs(half.y * scale.y), Math.abs(half.z * scale.z),
        );
        const box = new Box3(half.clone().negate(), half).applyMatrix4(transform.matrixWorld);
        return {
            minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z,
            top: box.max.y, bottom: box.min.y,
            orientation: {
                center: center.toArray(), halfSize: orientedHalf.toArray(), quaternion: rotation.toArray(),
            },
        } satisfies Surface;
    } }), [object, size?.[0], size?.[1], size?.[2]]);
    useRegisterNodeComponent(COLLISION_SURFACE, enabled ? capability : null);
    return <>
        {enabled && editMode && size && <ColliderWireframe size={size} />}
        {children}
    </>;
}
export const CollisionSurfaceComponent: Component = {
    name: 'CollisionSurface',
    renderWhenDisabled: true,
    category: 'physics', description: 'Collision-only box inferred from this node\'s geometry and transform.',
    properties: {},
    View: CollisionSurfaceView,
};

/** One static physics world per consumer; ready after collider registration finishes. */
export function useCollisionWorld() {
    const prefab = usePrefab();
    const components = useSceneComponents(COLLISION_SURFACE);
    const next = components.map(component => component.value).filter(surface => surface.belongsTo(prefab.root));
    const [surfaces, setSurfaces] = useState(next);
    // The registry is scene-wide, but sibling prefab colliders must not reset this player.
    if (next.length !== surfaces.length || next.some((surface, index) => surface !== surfaces[index])) {
        setSurfaces(next);
    }
    const [world, setWorld] = useState<CollisionWorld | null>(null);
    useLayoutEffect(() => {
        const bounds = surfaces.map(surface => surface.bounds());
        if (bounds.some(surface => surface === null)) {
            setWorld(null);
            return;
        }
        const collision = new CollisionWorld(bounds as Surface[]);
        setWorld(collision);
        return () => collision.dispose();
    }, [surfaces]);
    return world;
}
