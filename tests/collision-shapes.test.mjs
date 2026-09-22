import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry } from 'three';
import { registerAll } from 'crashcat';
import { createShapeForObject } from '../src/plugins/crashcat/collisionShapes.ts';
registerAll();

test('shared geometry produces colliders using each node’s current transforms', () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const a = new Group(), b = new Group();
    const first = new Mesh(geometry), second = new Mesh(geometry);
    a.add(first); b.add(second);
    first.scale.set(2, 1, 1);
    second.scale.set(4, 1, 1);
    assert.equal(createShapeForObject(a, {colliders:'cuboid'}).halfExtents[0], 2);
    assert.equal(createShapeForObject(b, {colliders:'cuboid'}).halfExtents[0], 4);
    first.scale.x = 3;
    assert.equal(createShapeForObject(a, {colliders:'cuboid'}).halfExtents[0], 3);
    geometry.dispose();
});

test('offset meshes keep their collider center', () => {
    const node = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    mesh.position.set(3, 2, 1);
    node.add(mesh);
    const shape = createShapeForObject(node, {colliders:'cuboid'});
    assert.deepEqual(shape.position, [3, 2, 1]);
    assert.deepEqual(shape.shape.halfExtents, [1, 1, 1]);
    mesh.geometry.dispose();
});

for (const colliders of ['hull', 'trimesh']) test(`${colliders} respects node scale`, () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    mesh.scale.set(2, 3, 4);
    const shape = createShapeForObject(mesh, {colliders});
    assert.deepEqual(shape.aabb, [-2, -3, -4, 2, 3, 4]);
    mesh.geometry.dispose();
});
