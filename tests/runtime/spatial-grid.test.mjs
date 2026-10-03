import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../../src/runtime/spatial/SpatialGrid.ts';

test('generic spatial membership handles negative boundaries, migration and removal', () => {
    const grid = new SpatialGrid(10), node = {}, light = {};
    assert.equal(grid.update(node, { x: -0.01, y: 10, z: 0 }), true);
    assert.equal(grid.cellOf(node), '-1,1,0');
    assert.equal(grid.update(node, { x: -9, y: 19, z: 9 }), false);
    grid.update(light, { x: -9, y: 19, z: 9 });
    assert.deepEqual([...grid.values('-1,1,0')], [node, light]);
    grid.update(node, { x: 0, y: 0, z: 0 });
    assert.deepEqual([...grid.values('-1,1,0')], [light]);
    grid.remove(light);
    assert.deepEqual([...grid.values('-1,1,0')], []);
    assert.equal(grid.cellOf(light), undefined);
    for (const size of [0, -1, Infinity, NaN]) assert.throws(() => new SpatialGrid(size));
});
