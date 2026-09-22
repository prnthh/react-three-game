import type { Prefab } from 'react-three-game/viewer';

/** A window is just Mesh + plane Geometry + InteriorMap; no room meshes. */
export function createInteriorScene(depth = 3, instanced = true): Prefab {
    return {
        id: 'interior-demo', name: 'Interior Mapping Study',
        root: { id: 'windows', children: [-3, 0, 3].flatMap((x, column) => [1.5, 4.3].map((y, row) => ({
            id: `window-${column}-${row}`, name: `Window ${column + 1}.${row + 1}`,
            components: {
                transform: { type: 'Transform', properties: { position: [x, y, 0] } },
                mesh: { type: 'Mesh', properties: { instanced, castShadow: false } },
                geometry: { type: 'Geometry', properties: { geometryType: 'plane', args: [2.4, 2.2] } },
                interior: { type: 'InteriorMap', properties: { roomSize: [2.4, 2.2, depth], color: '#ffffff' } },
            },
        }))) },
    } as Prefab;
}
