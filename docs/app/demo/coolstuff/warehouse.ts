import type { GameObject, Prefab } from 'react-three-game/core';

type Vec3 = [number, number, number];
export const RACK_HEIGHT = 3.9;
export const SHELF_TOPS = [0.24, 1.54, 2.84];
export const BOXES_PER_SHELF = 12;

function randomSequence(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function box(id: string, position: Vec3, size: Vec3, materialId: string, dynamic = false): GameObject {
    return {
        id, name: id,
        components: {
            transform: { type: 'Transform', properties: { position, scale: size } },
            mesh: { type: 'Mesh', properties: {} },
            geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [1, 1, 1] } },
            material: { type: 'Material', properties: { materialId } },
            physics: { type: 'CrashcatPhysics', properties: {
                type: dynamic ? 'dynamic' : 'fixed', colliders: 'cuboid',
                startSleeping: dynamic, friction: 0.8, restitution: 0,
            } },
        },
    };
}

/** Same seed and dimensions produce the same IDs, colors, sizes, and placements. */
export function createWarehouse({ seed = 42, rows = 6, bays = 8, stacks = 2 } = {}) {
    if (![rows, bays, stacks].every(n => Number.isInteger(n) && n > 0) || !Number.isFinite(seed)) {
        throw new Error('Warehouse dimensions must be positive integers and seed must be finite.');
    }
    const random = randomSequence(seed);
    const children: GameObject[] = [];
    const boxIds: string[] = [];
    children.push(box('warehouse-floor', [0, -0.2, 0], [bays * 4.4 + 6, 0.4, rows * 4.4 + 6], 'floor'));
    for (let row = 0; row < rows; row++) {
        for (let bay = 0; bay < bays; bay++) {
            const x = (bay - (bays - 1) / 2) * 4.4;
            const z = (row - (rows - 1) / 2) * 4.4;
            for (let stack = 0; stack < stacks; stack++) {
                const id = `rack-${row}-${bay}-${stack}`;
                const y = stack * RACK_HEIGHT;
                children.push({ id, name: id, components: {
                    transform: { type: 'Transform', properties: { position: [x, y, z] } },
                    prefab: { type: 'PrefabRef', properties: { url: '/prefabs/coolstuff/warehouse-rack.json' } },
                } });
                SHELF_TOPS.forEach((top, shelf) => {
                    for (let slot = 0; slot < BOXES_PER_SHELF; slot++) {
                        const width = 0.42 + random() * 0.12;
                        const height = 0.35 + random() * 0.55;
                        const depth = 0.48 + random() * 0.14;
                        const boxId = `${id}-shelf-${shelf}-box-${slot}`;
                        boxIds.push(boxId);
                        children.push(box(boxId, [
                            x + ((slot % 6) - 2.5) * 0.59,
                            y + top + height / 2,
                            z + (Math.floor(slot / 6) - 0.5) * 0.72,
                        ], [width, height, depth], `carton-${Math.floor(random() * 4)}`, true));
                    }
                });
            }
        }
    }
    const prefab: Prefab = {
        id: 'warehouse', name: 'Warehouse',
        materials: {
            floor: { color: '#38434b', roughness: 0.95 },
            ...Object.fromEntries(['#ae7846', '#c6945a', '#dbb783', '#8d623e'].map((color, i) => [
                `carton-${i}`, { color, roughness: 0.95 },
            ])),
        },
        root: { id: 'warehouse-root', name: 'Warehouse', children },
    };
    return { prefab, boxIds, rackCount: rows * bays * stacks };
}
