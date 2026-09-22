import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { getPhysicsScene } from '../src/plugins/crashcat/physicsScene.ts';

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
