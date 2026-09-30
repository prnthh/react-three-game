import { useEffect, useMemo } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { Box3, Box3Helper, Vector3, type LineBasicMaterial } from 'three';
import { createNodeComponentType, useNode, useGameObject, useRegisterNodeComponent, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import type { Surface } from '../movement';

export const JUMPER_SURFACE = createNodeComponentType<{ bounds(): Surface | null }>('JumperSurface');
type Properties = { size: [number, number, number]; color: string; solid: boolean; visible: boolean };
function ColliderWireframe({ bounds }: { bounds(): Surface | null }) {
    const scene = useThree(state => state.scene);
    const helper = useMemo(() => {
        const helper = new Box3Helper(new Box3(), '#52f5a5');
        const material = helper.material as LineBasicMaterial;
        material.depthTest = true;
        material.depthWrite = false;
        material.toneMapped = false;
        helper.renderOrder = 1000;
        helper.raycast = () => {};
        return helper;
    }, []);
    useEffect(() => () => helper.dispose(), [helper]);
    useFrame(() => {
        const box = bounds();
        helper.visible = !!box;
        if (!box) return;
        helper.box.min.set(box.minX, box.bottom ?? box.top, box.minZ);
        helper.box.max.set(box.maxX, box.top, box.maxZ);
    });
    // Bounds are world-aligned, including when a parent is rotated or scaled.
    return createPortal(<primitive object={helper} dispose={null} />, scene);
}

function SurfaceView({ properties, children }: ComponentViewProps<Properties>) {
    const object = useGameObject();
    const { editMode } = useNode();
    const capability = useMemo(() => ({ bounds() {
        const transform = object.transform;
        if (!transform) return null;
        transform.updateWorldMatrix(true, false);
        const half = new Vector3(...properties.size).multiplyScalar(0.5);
        const box = new Box3(half.clone().negate(), half).applyMatrix4(transform.matrixWorld);
        return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y, bottom: box.min.y, solid: properties.solid };
    } }), [object, properties.size, properties.solid]);
    useRegisterNodeComponent(JUMPER_SURFACE, capability);
    return <>
        {properties.visible && <mesh receiveShadow><boxGeometry args={properties.size} /><meshStandardMaterial color={properties.color} /></mesh>}
        {editMode && <ColliderWireframe bounds={capability.bounds} />}
        {children}
    </>;
}
export const SurfaceComponent: Component<Properties> = {
    name: 'JumperSurface', description: 'Axis-aligned platform or solid wall. Solid sides support wallrunning; keep rotation zero.',
    properties: { visible: { type: 'boolean', default: true, description: 'Disable the debug box when a separate mesh supplies the appearance.' }, solid: { type: 'boolean', default: false, description: 'Solid sides and ceiling; enables wallrunning.' }, size: { type: 'vector3', default: [4, 0.5, 4] }, color: { type: 'color', default: '#334155' } },
    View: SurfaceView,
};
