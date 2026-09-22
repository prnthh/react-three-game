import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLightSlots } from '../docs/app/demo/lights/selectLightSlots.ts';
import { scoreLight } from '../docs/app/demo/lights/scoreLight.ts';

test('light budget keeps surviving slot ownership and replaces only displaced lights', () => {
    assert.deepEqual(selectLightSlots([{id:'a',score:2},{id:'b',score:1},{id:'c',score:4}], ['a','b'], 2), ['a','c']);
});
test('hysteresis avoids churn near the cutoff, but allows a materially better light', () => {
    assert.deepEqual(selectLightSlots([{id:'a',score:1},{id:'b',score:1.1}], ['a'], 1), ['a']);
    assert.deepEqual(selectLightSlots([{id:'a',score:1},{id:'b',score:1.3}], ['a'], 1), ['b']);
});
test('culled and invalid candidates release slots; zero budget selects nothing', () => {
    assert.deepEqual(selectLightSlots([{id:'b',score:0},{id:'c',score:NaN}], ['a','b'], 2), [null,null]);
    assert.deepEqual(selectLightSlots([{id:'a',score:1}], ['a'], 0), []);
});

test('view budget favors lights ahead and follows camera rotation', () => {
    const eye = {x:0,y:0,z:0}, ahead = {x:0,y:0,z:-5}, behind = {x:0,y:0,z:5};
    const forward = {x:0,y:0,z:-1};
    const a = scoreLight(ahead, 10, 1, eye, forward);
    const b = scoreLight(behind, 10, 1, eye, forward);
    assert.ok(a > b && b > 0, 'overlapping lights behind remain eligible');
    assert.equal(scoreLight(behind, 10, 1, eye, {x:0,y:0,z:1}), a);
    assert.equal(scoreLight({x:0,y:0,z:11}, 10, 1, eye, forward), 0);
});

test('view budget accounts for height and pitch, not just the ground plane', () => {
    const eye = {x:0,y:20,z:0}, down = {x:0,y:-1,z:0};
    assert.ok(scoreLight({x:0,y:15,z:0},10,1,eye,down) > scoreLight({x:0,y:25,z:0},10,1,eye,down));
    assert.ok(scoreLight({x:0,y:15,z:0},10,1,eye,down) > scoreLight({x:0,y:0,z:0},10,1,eye,down));
});
