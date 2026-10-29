import { createNode } from '../core/prefab.js';
import { registerEditorNodePreset } from './NodePresets.js';

registerEditorNodePreset({ id: 'group', label: 'Group', category: 'Structure', create: () => createNode('Group', { transform: { type: 'Transform' } }) });
for (const [id, label, args] of [
    ['box', 'Box', [1, 1, 1]], ['sphere', 'Sphere', [0.5, 32, 16]],
    ['cylinder', 'Cylinder', [0.5, 0.5, 1, 32]], ['plane', 'Plane', [10, 10]],
] as const) {
    registerEditorNodePreset({ id, label, category: 'Primitives', create: () => createNode(label, {
        transform: { type: 'Transform', properties: id === 'plane' ? { rotation: [-Math.PI / 2, 0, 0] } : { position: [0, 0.5, 0] } },
        geometry: { type: 'Geometry', properties: { geometryType: id, args: [...args] } },
        material: { type: 'Material', properties: { color: '#b1b5bc', roughness: 0.85 } },
    }) });
}
registerEditorNodePreset({ id: 'terrain', label: 'Terrain', category: 'Landscape', description: 'Flat terrain with four paintable material layers.',
    create: () => createNode('Terrain', { transform: { type: 'Transform' }, terrain: { type: 'Terrain' } }) });
registerEditorNodePreset({ id: 'point-light', label: 'Point light', category: 'Lighting', create: () => createNode('Point light', {
    transform: { type: 'Transform', properties: { position: [0, 3, 0] } }, light: { type: 'PointLight', properties: { intensity: 10 } },
}) });
