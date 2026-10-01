import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { notifyObjectChanged } from '../../src/runtime/scene/objectChanges.ts';

test('transform changes notify descendants and compound owners, excluding sibling branches', () => {
    const root = new Group(), parent = new Group(), child = new Group(), sibling = new Group();
    root.add(parent, sibling); parent.add(child);
    const calls = [];
    const releases = [root, parent, child, sibling].map((object, id) => {
        const listener = () => calls.push(id);
        object.addEventListener('objectchange', listener);
        return () => object.removeEventListener('objectchange', listener);
    });
    notifyObjectChanged(parent);
    assert.deepEqual(calls, [1, 2, 0]);
    calls.length = 0;
    notifyObjectChanged(parent, 'geometry');
    assert.deepEqual(calls, [1, 0], 'geometry changes do not invalidate unrelated descendant bodies');
    releases.forEach(release => release());
    calls.length = 0;
    notifyObjectChanged(root);
    assert.deepEqual(calls, []);
});

test('notifications use native Object3D events and are explicit', () => {
    const parent = new Group(), child = new Group(); parent.add(child);
    let calls = 0;
    const listener = event => { assert.equal(event.target, child); calls++; };
    child.addEventListener('objectchange', listener);
    child.addEventListener('objectchange', listener);
    child.position.x = 3;
    child.updateMatrixWorld();
    assert.equal(calls, 0, 'ordinary simulation writes do not feed back into subscribers');
    notifyObjectChanged(child);
    assert.equal(calls, 1);
});
