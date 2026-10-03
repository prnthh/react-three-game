import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWarehouse, RACK_HEIGHT, SHELF_TOPS, BOXES_PER_SHELF } from '../app/demo/coolstuff/warehouse.ts';

const rack = JSON.parse(readFileSync(new URL('../public/prefabs/coolstuff/warehouse-rack.json', import.meta.url), 'utf8'));

test('warehouse population is reproducible and seed changes only item appearance and dimensions', () => {
    const a = createWarehouse();
    assert.deepEqual(a, createWarehouse());
    assert.equal(a.boxIds.length, 3456);
    assert.equal(a.rackCount, 96);
    assert.equal(new Set(a.prefab.root.children.map(node => node.id)).size, a.prefab.root.children.length);
    const b = createWarehouse({ seed: 43 });
    assert.deepEqual(a.boxIds, b.boxIds);
    assert.notDeepEqual(a.prefab, b.prefab);
    assert.equal(createWarehouse({ rows: 12 }).boxIds.length, 6912);
});

test('every shelf is filled with supported, separated sleeping boxes clear of poles and the shelf above', () => {
    const { prefab } = createWarehouse({ rows: 1, bays: 1 });
    const shelves = rack.root.children.filter(node => node.id.startsWith('shelf'));
    const poles = rack.root.children.filter(node => node.id.startsWith('pole'));
    assert.equal(shelves.length, 3);
    assert.equal(poles.length, 4);
    for (const part of rack.root.children) {
        assert.equal(part.components.physics.properties.colliders, 'cuboid');
        assert.equal(part.components.physics.properties.type, 'fixed');
    }
    assert.equal(poles[0].components.geometry.properties.args[1], RACK_HEIGHT);
    for (let stack = 0; stack < 2; stack++) for (let shelf = 0; shelf < 3; shelf++) {
        const items = prefab.root.children.filter(node => node.id.startsWith(`rack-0-0-${stack}-shelf-${shelf}-box-`));
        assert.equal(items.length, BOXES_PER_SHELF);
        const shelfPart = shelves[shelf].components;
        const top = shelfPart.transform.properties.position[1] + shelfPart.geometry.properties.args[1] / 2;
        assert.ok(Math.abs(top - SHELF_TOPS[shelf]) < 1e-10);
        for (const item of items) {
            const { position: [x, y, z], scale: [w, h, d] } = item.components.transform.properties;
            assert.ok(Math.abs(y - h / 2 - (stack * RACK_HEIGHT + top)) < 1e-10);
            assert.ok(Math.abs(x) + w / 2 < 1.84, 'clear of pole inner faces');
            assert.ok(Math.abs(z) + d / 2 < 0.74);
            assert.ok(y + h / 2 < stack * RACK_HEIGHT + top + 1.06);
            assert.equal(item.components.physics.properties.startSleeping, true);
            assert.equal(item.components.physics.properties.type, 'dynamic');
            for (const other of items) {
                if (other === item) continue;
                const { position: [ox, , oz], scale: [ow, , od] } = other.components.transform.properties;
                assert.ok(Math.abs(x - ox) >= (w + ow) / 2 || Math.abs(z - oz) >= (d + od) / 2);
            }
        }
    }
});
