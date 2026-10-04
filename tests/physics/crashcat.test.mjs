import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { getPhysicsScene } from '../../src/plugins/crashcat/physicsScene.ts';
import { registerAll } from 'crashcat';
import { createShapeForObject } from '../../src/plugins/crashcat/collisionShapes.ts';
import { decomposeModelToPrefabNodes } from '../../src/editor/modelPrefab.ts';
import { importCollisionModel } from '../../src/plugins/crashcat/importCollisionModel.ts';

describe('Scene ownership', () => {
    test('physics ownership is isolated per Three.js scene and releases on unmount', () => {
        const scene = new Scene();
        const first = getPhysicsScene(scene);
        const second = getPhysicsScene(new Scene());
        assert.equal(getPhysicsScene(scene), first);
        const updates = [];
        const unsubscribe = first.subscribe(() => updates.push(first.getSnapshot()));
        const a = {world:'a'}, b = {world:'b'};
        const releaseA = first.register(a);
        const releaseB = second.register(b);
        assert.equal(first.getSnapshot(), a);
        assert.equal(second.getSnapshot(), b);
        assert.throws(() => first.register(b), /Only one CrashcatRuntime/);
        releaseA();
        assert.equal(first.getSnapshot(), null);
        assert.equal(second.getSnapshot(), b);
        const releaseReplacement = first.register(b);
        releaseA();
        assert.equal(first.getSnapshot(), b, 'old cleanup cannot clear its replacement');
        releaseReplacement();
        assert.deepEqual(updates, [a, null, b, null]);
        unsubscribe();
        releaseB();
    });
});

describe('Collision shapes', () => {
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
});

describe('Model import', () => {
    test('generic model conversion is physics agnostic; collision import is explicitly supplied by the plugin', () => {
        const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
        model.name = 'wall_colonly';
        const generic = decomposeModelToPrefabNodes(model);
        assert.equal(generic.root.components.geometry.properties.visible, true);
        assert.ok(!Object.values(generic.root.components).some(c => c.type === 'CrashcatPhysics'));
        const physics = importCollisionModel(model);
        assert.equal(physics.root.name, 'wall');
        assert.equal(physics.root.hidden, false);
        assert.equal(physics.root.components.geometry.properties.visible, false);
        assert.equal(physics.root.components.physics.type, 'CrashcatPhysics');
        model.name = 'wall';
        assert.equal(importCollisionModel(model), null);
        model.geometry.dispose();
        model.material.dispose();
    });
});
