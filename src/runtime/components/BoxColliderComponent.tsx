import { useEffect, useMemo } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import type { Component } from '../../core/ComponentRegistry.js';
import type { BoxColliderProperties } from '../../core/collision.js';
import { useNode } from '../scene/SceneContext.js';

const BoxColliderComponent: Component<BoxColliderProperties> = {
    name: 'BoxCollider',
    category: 'physics',
    description: 'Author a box collision shape independently of rendered geometry. Size and center are local to this node; parent transforms apply. A host physics adapter consumes this shape.',
    properties: {
        size: { type: 'vector3', default: [1, 1, 1], description: 'Positive local dimensions along X, Y and Z.' },
        center: { type: 'vector3', default: [0, 0, 0], description: 'Local offset of the collision shape.' },
    },
    View: function BoxColliderView({ properties, children }) {
        const { editMode, isSelected } = useNode();
        const [x, y, z] = properties.size;
        const edges = useMemo(() => {
            if (!editMode) return null;
            const box = new BoxGeometry(x, y, z);
            const edges = new EdgesGeometry(box);
            box.dispose();
            return edges;
        }, [editMode, x, y, z]);
        useEffect(() => () => edges?.dispose(), [edges]);
        return <>{children}{edges && <lineSegments geometry={edges} position={properties.center} renderOrder={10000}>
            <lineBasicMaterial color={isSelected ? '#ffffff' : '#63edb0'} transparent
                opacity={isSelected ? 0.95 : 0.3} depthTest={!isSelected} depthWrite={false} toneMapped={false} />
        </lineSegments>}</>;
    },
};
export default BoxColliderComponent;
