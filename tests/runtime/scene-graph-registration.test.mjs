import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PointLight, Scene } from 'three';
import { createNodeComponentType, getSceneComponentRegistry } from '../../src/runtime/scene/SceneContext.tsx';
import { SCENE_LIGHT, SCENE_OBJECT, retainSceneGraphRegistration } from '../../src/runtime/scene/SceneGraphRegistration.tsx';

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
