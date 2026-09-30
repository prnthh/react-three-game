import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaneGeometry, Triangle } from 'three';
import { surfaceHeight, terrainHeight, vegetationPlacements, TERRAIN_SEGMENTS } from '../app/demo/grassworld/terrain.ts';

test('vegetation uses the collision mesh triangles, including negative heights and distant chunks', () => {
    const size = 24;
    for (const [cx, cz] of [[0, 0], [-3, -2], [30, 40]]) {
        const geometry = new PlaneGeometry(size, size, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
        geometry.rotateX(-Math.PI / 2);
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i) + cx * size, z = p.getZ(i) + cz * size;
            p.setXYZ(i, x, terrainHeight(x, z), z);
        }
        const triangle = new Triangle();
        for (let i = 0; i < geometry.index.count; i += 3) {
            triangle.a.fromBufferAttribute(p, geometry.index.getX(i));
            triangle.b.fromBufferAttribute(p, geometry.index.getX(i + 1));
            triangle.c.fromBufferAttribute(p, geometry.index.getX(i + 2));
            const point = triangle.a.clone().multiplyScalar(0.2)
                .addScaledVector(triangle.b, 0.3).addScaledVector(triangle.c, 0.5);
            assert.ok(Math.abs(surfaceHeight(point.x, point.z, size, terrainHeight) - point.y) < 1e-6);
        }
        geometry.dispose();
    }
});

test('unloaded vegetation regenerates identically without a finite heightmap boundary', () => {
    const generate = (x, z) => vegetationPlacements(x, z, 24, 8192, terrainHeight, -0.7, 0.45, 0.55);
    const before = generate(30, -40);
    generate(-20, 50);
    assert.deepEqual(before, generate(30, -40));
    assert.ok(before.length > 0 && before.length <= 8192);
    assert.notDeepEqual(before, generate(31, -40));
    for (const plant of before) {
        assert.ok(plant.x >= -12 && plant.x < 12 && plant.z >= -12 && plant.z < 12);
        assert.ok(plant.y > -0.7 + 0.45);
        assert.equal(plant.y, surfaceHeight(720 + plant.x, -960 + plant.z, 24, terrainHeight));
    }
    assert.deepEqual(vegetationPlacements(-1, 2, 24, 100, () => -2, -0.7, 0.45, 0.55), []);
});

test('trails stay on contacted blades and survive subsequent movement; airborne players do not trample', async () => {
    const { stampGrassTrail } = await import('../app/demo/grassworld/terrain.ts');
    const plants = [{ x: 0, y: -2, z: 0 }, { x: 2, y: -2, z: 0 }, { x: 0, y: 5, z: 0 }];
    const stamps = new Float32Array(3).fill(-1000);
    assert.equal(stampGrassTrail(plants, stamps, 0, -1.5, 0, 10), true);
    assert.deepEqual([...stamps], [10, -1000, -1000]);
    stampGrassTrail(plants, stamps, 2, -1.5, 0, 11);
    assert.deepEqual([...stamps], [10, 11, -1000]);
    assert.equal(stampGrassTrail(plants, stamps, 0, 0, 0, 12), false);
    assert.deepEqual([...stamps], [10, 11, -1000]);
});


test('soft trail edges do not erase deeper footprints', async () => {
    const { stampGrassTrail, GRASS_TRAIL_RECOVERY } = await import('../app/demo/grassworld/terrain.ts');
    const plants = [{ x: 0, y: 0, z: 0 }], stamps = new Float32Array(1).fill(-1000);
    stampGrassTrail(plants, stamps, 0.9, 0.5, 0, 10);
    const edge = Math.exp(-GRASS_TRAIL_RECOVERY * (10 - stamps[0]));
    assert.ok(edge > 0 && edge < 0.5);
    stampGrassTrail(plants, stamps, 0, 0.5, 0, 10);
    assert.equal(stamps[0], 10);
    stampGrassTrail(plants, stamps, 0.99, 0.5, 0, 10.1);
    assert.equal(stamps[0], 10);
    assert.ok(Math.exp(-GRASS_TRAIL_RECOVERY * (14 - stamps[0])) < 0.01);
});
