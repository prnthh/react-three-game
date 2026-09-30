import type { Prefab } from 'react-three-game/core';

/** Shared by the editor and viewer: the saved settings are identical in both. */
export const rotatorScene: Prefab = {
    id: 'rotator-basics', name: 'Rotator basics',
    materials: {
        amber: { color: '#f59e0b', roughness: 0.6 },
        coral: { color: '#fb7185', roughness: 0.6 },
        teal: { color: '#2dd4bf', roughness: 0.6 },
        violet: { color: '#a78bfa', roughness: 0.6 },
    },
    root: { id: 'root', children: [
        ...[
            { id: 'box', name: 'Box · Y', position: [-4, 0, 2], geometry: 'box', args: [2, 1, 1], material: 'amber', axis: 'y', speed: 1 },
            { id: 'torus', name: 'Torus · X', position: [0, 0, 2], geometry: 'torus', args: [0.85, 0.25, 12, 48], material: 'coral', axis: 'x', speed: 1.8 },
            { id: 'cone', name: 'Cone · −Z', position: [-4, 0, -2], geometry: 'cylinder', args: [0, 0.8, 1.8, 24], material: 'teal', axis: 'z', speed: -0.8 },
            { id: 'cylinder', name: 'Cylinder · −X', position: [0, 0, -2], geometry: 'cylinder', args: [0.6, 0.6, 1.8, 16], material: 'violet', axis: 'x', speed: -1.2 },
        ].map(({ id, name, position, geometry, args, material, axis, speed }) => ({
            id, name,
            components: {
                transform: { type: 'Transform', properties: { position } },
                mesh: { type: 'Mesh', properties: {} },
                geometry: { type: 'Geometry', properties: { geometryType: geometry, args } },
                material: { type: 'Material', properties: { materialId: material } },
                rotator: { type: 'Rotator', properties: { speed, axis } },
            },
        })),
        {
            id: 'tree', name: 'Loaded tree · −Y',
            components: {
                transform: { type: 'Transform', properties: { position: [4, -1, 2], scale: [0.18, 0.18, 0.18] } },
                model: { type: 'Model', properties: { filename: 'models/environment/tree.glb' } },
                rotator: { type: 'Rotator', properties: { axis: 'y', speed: -0.6 } },
            },
        },
        {
            id: 'character', name: 'Skinned character · Y',
            components: {
                transform: { type: 'Transform', properties: { position: [4, -1, -2] } },
                model: { type: 'AnimatedModel', properties: { filename: 'models/human/onimilio.glb', animationState: 'walk' } },
                rotator: { type: 'Rotator', properties: { axis: 'y', speed: 0.8 } },
            },
        },
    ] },
};
