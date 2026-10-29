import { useMemo } from 'react';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import type { GameObject } from '../../core/types.js';
import { createNodeComponentType, useGameObject, useNode, useRegisterNodeComponent } from '../../runtime/scene/SceneContext.js';
import { usePrefabStore } from '../../runtime/prefabs/PrefabStoreContext.js';

export function terrainPhysicsProblem(node: Pick<GameObject, 'components'> | null | undefined) {
    const terrain = Object.values(node?.components ?? {}).find(component => component?.type === 'Terrain');
    if (!terrain) return 'Missing terrain data: add a Terrain component to this node.';
    if (!terrain.properties.heightMap) return 'Missing terrain data: Terrain needs a height map to create physics colliders.';
    return null;
}
export type TerrainPhysicsProperties = { friction?: number };
export type TerrainPhysicsHandle = {
    id: string;
    object: ReturnType<typeof useGameObject>;
    friction: number;
    problem: string | null;
    state: string;
    error: string | null;
};
export const TERRAIN_PHYSICS_COMPONENT = createNodeComponentType<TerrainPhysicsHandle>('TerrainPhysics');
function TerrainPhysicsView({ properties, enabled, children }: ComponentViewProps<TerrainPhysicsProperties>) {
    const object = useGameObject();
    const nodeId = useNode(node => node.nodeId);
    const node = usePrefabStore(state => state.nodesById[nodeId]);
    const problem = terrainPhysicsProblem(node);
    const handle = useMemo<TerrainPhysicsHandle>(() => ({ id: object.id, object, friction: properties.friction, problem,
        state: problem ? 'error' : 'waiting', error: problem }), [object, properties.friction, problem]);
    useRegisterNodeComponent(TERRAIN_PHYSICS_COMPONENT, enabled ? handle : null);
    return <>{children}</>;
}
export const TerrainPhysicsComponent: Component<TerrainPhysicsProperties> = {
    name: 'TerrainPhysics', category: 'physics', renderWhenDisabled: true,
    description: 'Uses this node’s Terrain height map. CrashcatRuntime prepares colliders in a worker and keeps only the nearest two to the camera active.',
    View: TerrainPhysicsView,
    properties: { friction: { default: .8, min: 0, max: 2, step: .05 } },
};
