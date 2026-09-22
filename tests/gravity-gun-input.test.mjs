import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGravityGunInput } from '../docs/app/demo/killbox/components/gravityGunInput.ts';

test('right-click toggles across releases and lock notifications; left-click throws only held objects', () => {
    const events = new EventTarget();
    const pointer = new EventTarget();
    pointer.pointerLockElement = {};
    let held = false, throws = 0, drops = 0;
    const unbind = bindGravityGunInput(events, pointer, {
        grab: () => { held = !held; },
        throw: () => { if (held) { held = false; throws++; } },
        clear: () => {},
        drop: () => { held = false; drops++; },
    });
    const mouse = (type, button) => {
        const event = new Event(type);
        Object.defineProperty(event, 'button', { value: button });
        events.dispatchEvent(event);
    };
    mouse('mousedown', 2);
    mouse('mouseup', 2);
    pointer.dispatchEvent(new Event('pointerlockchange'));
    events.dispatchEvent(new Event('blur'));
    assert.equal(held, true);
    assert.equal(drops, 0);
    mouse('mousedown', 2);
    assert.equal(held, false);
    mouse('mouseup', 2);
    mouse('mousedown', 0);
    assert.equal(throws, 0);
    mouse('mousedown', 2);
    mouse('mouseup', 2);
    mouse('mousedown', 0);
    assert.equal(held, false);
    assert.equal(throws, 1);
    mouse('mousedown', 2);
    pointer.pointerLockElement = null;
    pointer.dispatchEvent(new Event('pointerlockchange'));
    assert.equal(held, false);
    assert.equal(drops, 1);
    mouse('mousedown', 2);
    assert.equal(held, false);
    unbind();
    pointer.pointerLockElement = {};
    mouse('mousedown', 2);
    assert.equal(held, false);
});
