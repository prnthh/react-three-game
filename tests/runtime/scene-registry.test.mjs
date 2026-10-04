import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeComponentRegistry, createNodeComponentType, getSceneComponentRegistry } from '../../src/runtime/scene/SceneContext.tsx';
import { Group, PointLight, Scene } from 'three';
import { SCENE_LIGHT, SCENE_OBJECT, retainSceneGraphRegistration } from '../../src/runtime/scene/SceneGraphRegistration.tsx';

describe('Registration lifecycle', () => {
    const TYPE = createNodeComponentType('test'), OTHER = createNodeComponentType('other');

    test('registration cleanup cannot remove replacements, including the same value', () => {
        const registry = createNodeComponentRegistry(), value = {};
        const old = registry.register('node', TYPE, value);
        const current = registry.register('node', TYPE, value);
        old(); assert.equal(registry.get('node', TYPE), value);
        const next = registry.register('node', TYPE, 42);
        current(); assert.equal(registry.get('node', TYPE), 42);
        next(); next(); assert.equal(registry.get('node', TYPE), null);
        const removed = registry.register('node', TYPE, value);
        registry.register('node', TYPE, null);
        registry.register('node', TYPE, 12);
        removed(); assert.equal(registry.get('node', TYPE), 12);
    });

    test('nested batches publish one notification per type with coherent final state', () => {
        const registry = createNodeComponentRegistry(), notifications = [];
        registry.subscribe(TYPE, () => notifications.push([registry.getAll(TYPE).length, registry.getAll(OTHER).length]));
        let otherCalls = 0; registry.subscribe(OTHER, () => otherCalls++);
        const empty = registry.getAll(TYPE);
        const result = registry.batch(() => {
            registry.register('a', TYPE, 1);
            registry.batch(() => { registry.register('b', TYPE, 2); registry.register('c', OTHER, 3); });
            assert.equal(notifications.length, 0);
            assert.equal(registry.get('b', TYPE), 2);
            return 17;
        });
        assert.equal(result, 17);
        assert.deepEqual(notifications, [[2, 1]]);
        assert.equal(otherCalls, 1);
        const snapshot = registry.getAll(TYPE);
        assert.notEqual(snapshot, empty);
        assert.equal(snapshot, registry.getAll(TYPE));
        assert.equal(snapshot[0].key, 'a');
        assert.throws(() => registry.batch(() => { registry.register('d', TYPE, 4); throw new Error('failed'); }));
        assert.deepEqual(notifications, [[2, 1], [3, 1]], 'batching does not roll back writes');
        registry.register('e', TYPE, 5);
        assert.deepEqual(notifications.at(-1), [4, 1], 'exceptions do not leave notifications suspended');
    });

    test('prefab object cleanup also preserves a replacement mount', async () => {
        const { createPrefabRegistry } = await import('../../src/runtime/scene/SceneContext.tsx');
        const { Group } = await import('three');
        const registry = createPrefabRegistry(), object = new Group();
        const first = registry.registerObject('node', object), second = registry.registerObject('node', object);
        first(); assert.equal(registry.getObject('node'), object);
        second(); assert.equal(registry.getObject('node'), null);
    });
});

describe('Scene graph registration', () => {
    test('scene graph and gameplay components share one registry with independent lifecycles', () => {
        const scene = new Scene(), registry = getSceneComponentRegistry(scene);
        const custom = createNodeComponentType('custom');
        registry.register('player', custom, { health: 100 });
        const release = retainSceneGraphRegistration(scene), releaseSecond = retainSceneGraphRegistration(scene);
        const group = new Group(), light = new PointLight();
        group.add(light); scene.add(group);
        assert.equal(getSceneComponentRegistry(scene), registry);
        assert.equal(registry.get(light.uuid, SCENE_OBJECT), light);
        assert.equal(registry.get(light.uuid, SCENE_LIGHT), light);
        const snapshot = registry.getAll(SCENE_LIGHT);
        assert.equal(registry.getAll(SCENE_LIGHT), snapshot);
        const other = new Scene(); other.add(group);
        assert.equal(registry.getAll(SCENE_LIGHT).length, 0);
        const releaseOther = retainSceneGraphRegistration(other);
        assert.equal(getSceneComponentRegistry(other).get(light.uuid, SCENE_LIGHT), light);
        scene.add(group);
        assert.equal(getSceneComponentRegistry(other).getAll(SCENE_LIGHT).length, 0);
        release(); assert.equal(registry.getAll(SCENE_LIGHT).length, 1);
        releaseSecond(); releaseSecond();
        assert.equal(registry.getAll(SCENE_OBJECT).length, 0);
        assert.deepEqual(registry.get('player', custom), { health: 100 });
        releaseOther();
    });

    test('subtree lifecycle publishes once per type after every descendant is indexed', () => {
        const scene = new Scene(), registry = getSceneComponentRegistry(scene);
        const release = retainSceneGraphRegistration(scene);
        const counts = [];
        registry.subscribe(SCENE_OBJECT, () => counts.push([registry.getAll(SCENE_OBJECT).length, registry.getAll(SCENE_LIGHT).length]));
        const group = new Group(); group.add(new PointLight(), new PointLight());
        scene.add(group);
        assert.deepEqual(counts, [[4, 2]]);
        scene.remove(group);
        assert.deepEqual(counts, [[4, 2], [1, 0]]);
        release();
        assert.deepEqual(counts.at(-1), [0, 0]);
    });
});
