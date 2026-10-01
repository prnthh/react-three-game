import { useMemo } from 'react';
import { Box3, Quaternion, Vector3 } from 'three';
import { createNodeComponentType, findComponent, useNode, useGameObject, usePrefab, useRegisterNodeComponent, type Component, type ComponentViewProps, type GameObject } from 'react-three-game/viewer';
import type { Surface } from '../movement';

export const COLLISION_SURFACE = createNodeComponentType<{ bounds(): Surface | null }>('CollisionSurface');
type BoxSize = [number, number, number];
type Properties = { fallbackSize: BoxSize; solid: boolean };

/** Resolve collision dimensions from authored geometry, using the fallback only for geometry-free nodes. */
export function resolveCollisionSurfaceSize(node: GameObject | null, fallback: BoxSize): BoxSize {
    const geometry = findComponent(node, 'Geometry');
    if (!geometry || (geometry.properties.geometryType ?? 'box') !== 'box') return fallback;
    const args = geometry.properties.args;
    if (!Array.isArray(args) || args.length < 3
        || !args.slice(0, 3).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) return fallback;
    return [args[0], args[1], args[2]];
}

function ColliderWireframe({ size }: { size: BoxSize }) {
    return <mesh raycast={() => {}} renderOrder={1000} userData={{ editorHelper: true }}>
        <boxGeometry args={size} />
        <meshBasicMaterial color="#52f5a5" depthWrite={false} toneMapped={false} wireframe />
    </mesh>;
}

function CollisionSurfaceView({ properties, children, enabled }: ComponentViewProps<Properties>) {
    const object = useGameObject();
    const prefab = usePrefab();
    const { editMode, nodeId } = useNode();
    const size = resolveCollisionSurfaceSize(prefab.get(nodeId), properties.fallbackSize);
    const capability = useMemo(() => ({ bounds() {
        const transform = object.transform;
        if (!transform) return null;
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
            top: box.max.y, bottom: box.min.y, solid: properties.solid,
            orientation: {
                center: center.toArray(), halfSize: orientedHalf.toArray(), quaternion: rotation.toArray(),
            },
        } satisfies Surface;
    } }), [object, size[0], size[1], size[2], properties.solid]);
    useRegisterNodeComponent(COLLISION_SURFACE, enabled ? capability : null);
    return <>
        {enabled && editMode && <ColliderWireframe size={size} />}
        {children}
    </>;
}
export const CollisionSurfaceComponent: Component<Properties> = {
    name: 'CollisionSurface', renderWhenDisabled: true, description: 'Collision-only box inferred from this node\'s geometry and transform.',
    properties: {
        solid: { type: 'boolean', default: false, description: 'Solid sides and ceiling; enables wallrunning.' },
        fallbackSize: { type: 'vector3', label: 'Fallback Size', default: [1, 1, 1], description: 'Used only when this node has no box geometry component.' },
    },
    View: CollisionSurfaceView,
};
