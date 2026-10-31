import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, EdgesGeometry } from 'three';
import type { Component } from '../../core/ComponentRegistry.js';
import type { MeshColliderProperties } from '../../core/collision.js';
import { useNode } from '../scene/SceneContext.js';

const MeshColliderComponent: Component<MeshColliderProperties> = {
    name: 'MeshCollider', category: 'physics',
    description: 'Engine-neutral authored collision mesh. Import _col/_colonly for triangle surfaces or _convcol/_convcolonly for a convex hull. A host physics adapter consumes the serialized shape.',
    properties: {
        positions: { type: 'array', default: [], schema: { type: 'array', items: { type: 'number' } } },
        indices: { type: 'array', default: [], schema: { type: 'array', items: { type: 'integer' } } },
        shape: { type: 'select', default: 'trimesh', options: [{ value: 'trimesh', label: 'Triangle mesh' }, { value: 'convex', label: 'Convex hull' }] },
    },
    View: function MeshColliderView({ properties, children }) {
        const { editMode, isSelected } = useNode();
        const edges = useMemo(() => {
            if (!editMode || !properties.positions.length) return null;
            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new Float32BufferAttribute(properties.positions, 3));
            if (properties.indices?.length) geometry.setIndex(properties.indices);
            const edges = new EdgesGeometry(geometry); geometry.dispose(); return edges;
        }, [editMode, properties.positions, properties.indices]);
        useEffect(() => () => edges?.dispose(), [edges]);
        return <>{children}{edges && <lineSegments geometry={edges} renderOrder={10000}>
            <lineBasicMaterial color={isSelected ? '#ffffff' : '#63edb0'} transparent opacity={isSelected ? 0.95 : 0.3}
                depthTest={!isSelected} depthWrite={false} toneMapped={false} />
        </lineSegments>}</>;
    },
};
export default MeshColliderComponent;
