import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { SurfaceGrid } from '../app/demo/parkour/spatial.ts';
import { createParkourState, stepParkour } from '../app/demo/parkour/movement.ts';
import { PARKOUR_STEP } from '../app/demo/parkour/simulation.ts';
import { expandEmbeddedPrefabs } from './support/expand-prefabs.mjs';

const settings = { speed: 13, jumpSpeed: 9, slideBoost: 3 };
const idle = { x: 0, z: 0, jump: false };
const box = (x, y, z, width = 2) => ({ minX: x, maxX: x + width, bottom: y, top: y + 2, minZ: z, maxZ: z + width });

test('3D queries cover negative cells, boundaries and multi-cell boxes without duplicates', () => {
    const surfaces = [box(-9, -9, -9, 18), box(0, 30, 0), box(-8, 0, -8), box(8, 0, 8)];
    const grid = new SurfaceGrid(surfaces, 8);
    const query = { minX: -8, maxX: 8, minY: -10, maxY: 3, minZ: -8, maxZ: 8 };
    assert.deepEqual(grid.query(query), [surfaces[0], surfaces[2], surfaces[3]]);
    assert.deepEqual(grid.query({ ...query, minY: 29, maxY: 33 }), [surfaces[1]]);
    assert.deepEqual(grid.query(query), [surfaces[0], surfaces[2], surfaces[3]]);
});

test('prepared grid geometry stays with its snapshot while raw edited surfaces remain live', () => {
    const surface = { ...box(0, 0, 0), orientation: {
        center: [1, 1, 1], halfSize: [1, 1, 1], quaternion: [0, 0, 0, 1],
    } };
    const original = structuredClone(surface);
    const grid = new SurfaceGrid([surface]);
    surface.minX += 100; surface.maxX += 100;
    surface.orientation.center[0] += 100;
    const state = { ...createParkourState([-0.5, 0.5, 1]), velocity: [30, 0] };
    const cached = stepParkour(state, idle, settings, grid, 0.1);
    assert.deepEqual(cached, stepParkour(state, idle, settings, [original], 0.1));
    const edited = stepParkour(state, idle, settings, [surface], 0.1);
    assert.ok(edited.position[0] > cached.position[0]);
    assert.deepEqual(edited, stepParkour(state, idle, settings, new SurfaceGrid([surface]), 0.1));
});

test('oversized floors, bottomless walls, and long sweeps use bounded fallbacks', () => {
    const floor = { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000, top: 0 };
    const wall = { ...box(0, 0, 0), bottom: undefined };
    const grid = new SurfaceGrid([floor, wall]);
    assert.deepEqual(grid.query({ minX: -1, maxX: 1, minY: -1000, maxY: -999, minZ: -1, maxZ: 1 }), [floor, wall]);
    assert.deepEqual(grid.query({ minX: -20000, maxX: 20000, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }), [floor, wall]);
});

function compare(state, input, surfaces, dt = PARKOUR_STEP) {
    assert.deepEqual(stepParkour(state, input, settings, new SurfaceGrid(surfaces), dt),
        stepParkour(state, input, settings, surfaces, dt));
}
test('swept queries preserve fast falls, thin walls, ceilings, wall contact and crouch clearance', () => {
    const floor = { minX: -100, maxX: 100, minZ: -100, maxZ: 100, top: 0 };
    compare({ ...createParkourState([0, 40, 0]), velocityY: -6000 }, idle, [floor]);
    compare({ ...createParkourState([-1, 1, 0]), velocity: [34, 0] }, idle,
        [{ minX: 0, maxX: 0.01, minZ: -10, maxZ: 10, bottom: 0, top: 5 }], 0.1);
    const ceiling = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, bottom: 1.2, top: 2 };
    compare({ ...createParkourState([0, 0, 0]), crouched: true, grounded: true }, idle, [floor, ceiling]);
    compare({ ...createParkourState([0, -1, 0]), velocityY: 80 }, idle, [ceiling]);
    compare({ ...createParkourState([-0.37, 2, 0]), velocity: [0, -13] },
        { x: 0, z: -1, facingX: 0, facingZ: -1, jump: true }, [box(0, 0, -10, 20)]);
});

test('rotated top faces and their radius extension remain candidates across cell edges', () => {
    const center = new Vector3(-8, 8, 8), half = new Vector3(4, 0.1, 2);
    const quaternion = new Quaternion().setFromEuler(new Euler(0.3, 0.7, -0.2));
    const matrix = new Matrix4().compose(center, quaternion, new Vector3(1, 1, 1));
    const bounds = new Box3(half.clone().negate(), half.clone()).applyMatrix4(matrix);
    const surface = { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z,
        bottom: bounds.min.y, top: bounds.max.y,
        orientation: { center: center.toArray(), halfSize: half.toArray(), quaternion: quaternion.toArray() } };
    const tiltedGrid = new SurfaceGrid([surface]);
    for (const localX of [-4.25, -4, 0, 4, 4.25]) {
        const point = new Vector3(localX, half.y, 0).applyMatrix4(matrix);
        let plain = createParkourState([point.x, point.y + 1, point.z]);
        let indexed = structuredClone(plain);
        for (let tick = 0; tick < 90; tick++) {
            plain = stepParkour(plain, idle, settings, [surface], PARKOUR_STEP);
            indexed = stepParkour(indexed, idle, settings, tiltedGrid, PARKOUR_STEP);
            assert.deepEqual(indexed, plain);
        }
    }
});

// Use the authored course including rotated top faces, matching runtime bounds.
const course = expandEmbeddedPrefabs(JSON.parse(readFileSync(new URL('../public/prefabs/parkour-course.json', import.meta.url), 'utf8')));
const surfaces = [];
function visit(node, parent = new Matrix4()) {
    const t = node.components?.transform?.properties ?? {};
    const world = parent.clone().multiply(new Matrix4().compose(new Vector3(...(t.position ?? [0, 0, 0])),
        new Quaternion().setFromEuler(new Euler(...(t.rotation ?? [0, 0, 0]))), new Vector3(...(t.scale ?? [1, 1, 1]))));
    const collision = node.components?.collision?.properties;
    if (collision) {
        const size = node.components?.geometry?.properties?.args?.slice(0, 3) ?? [1, 1, 1];
        const half = new Vector3(...size).multiplyScalar(0.5);
        const bounds = new Box3(half.clone().negate(), half.clone()).applyMatrix4(world);
        const center = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
        world.decompose(center, rotation, scale);
        surfaces.push({ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z,
            bottom: bounds.min.y, top: bounds.max.y,
            orientation: { center: center.toArray(), quaternion: rotation.toArray(), halfSize: half.multiply(scale).toArray().map(Math.abs) } });
    }
    node.children?.forEach(child => visit(child, world));
}
visit(course.root);
const grid = new SurfaceGrid(surfaces);

test('indexed course movement matches full scans on every tick across many starts and inputs', () => {
    let seed = 1234;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let run = 0; run < 40; run++) {
        const surface = surfaces[Math.floor(random() * surfaces.length)];
        let plain = createParkourState([(surface.minX + surface.maxX) / 2, surface.top + random() * 3, (surface.minZ + surface.maxZ) / 2]);
        let indexed = structuredClone(plain);
        for (let tick = 0; tick < 180; tick++) {
            const angle = run + tick * 0.027;
            const input = { x: Math.cos(angle), z: Math.sin(angle), facingX: Math.cos(angle), facingZ: Math.sin(angle),
                jump: tick % 51 === 0, crouch: tick % 100 > 60 };
            plain = stepParkour(plain, input, settings, surfaces, PARKOUR_STEP);
            indexed = stepParkour(indexed, input, settings, grid, PARKOUR_STEP);
            assert.deepEqual(indexed, plain, `run ${run}, tick ${tick}`);
        }
    }
});

test('course grid substantially narrows candidates', () => {
    const starts = surfaces.filter((_, i) => i % 20 === 0).map(s => [(s.minX + s.maxX) / 2, s.top, (s.minZ + s.maxZ) / 2]);
    let candidates = 0;
    for (const [x, y, z] of starts) candidates += grid.query({ minX: x - 1, maxX: x + 1, minY: y - 1, maxY: y + 3, minZ: z - 1, maxZ: z + 1 }).length;
    const average = candidates / starts.length;
    assert.ok(average < surfaces.length / 4, `${average} of ${surfaces.length}`);
});
