import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { cameraRoll, wallrunYaw } from '../app/demo/parkour/camera.ts';
import { createParkourState, DEFAULT_MOVEMENT_SETTINGS, GRAVITY, stepParkour } from '../app/demo/parkour/movement.ts';
import { PARKOUR_STEP as dt } from '../app/demo/parkour/simulation.ts';

// Box3D uses float32 collision math; numeric checks allow its rounding tolerance.
import { collisionWorld } from './support/collision-world.mjs';

const settings = DEFAULT_MOVEMENT_SETTINGS;
const floor = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000, top: 0 };
const grounded = () => ({ ...createParkourState([0, 0, 0]), grounded: true });
const step = (state, input = {}, world = [floor]) => stepParkour(state, { x: 0, z: 0, jump: false, ...input }, settings, collisionWorld(world), dt);
const speed = state => Math.hypot(...state.velocity);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);
const wall = { minX: -2, maxX: -0.3, minZ: -100, maxZ: 100, bottom: 0, top: 100 };
const besideWall = () => ({ ...createParkourState([0, 5, 0]), velocity: [0, -20], velocityY: 2 });
const wallStep = (state, input = {}, world = [wall]) => step(state,
    { x: -0.6, z: -0.8, facingX: -0.6, facingZ: -0.8, ...input }, world);

test('grounded, crouching and idle movement skip unused queries without skipping collisions', () => {
    const world = collisionWorld([floor, wall]);
    const queries = {
        move: (...args) => world.move(...args),
        wallAt: () => assert.fail('wall attachment is unavailable'),
        canStand: () => assert.fail('standing clearance is unnecessary while crouch is held'),
    };
    for (const [state, extra] of [
        [grounded(), {}],
        [{ ...besideWall(), crouched: true }, { crouch: true }],
        [besideWall(), { x: 0, z: 0 }],
    ]) {
        const next = stepParkour(state, { x: -1, z: 0, jump: false, ...extra }, settings, queries, dt);
        assert.equal(next.wallNormal, null);
        assert.ok(next.position[0] >= -1e-4, 'the capsule still respects the wall');
    }
    let clearanceChecks = 0;
    const next = stepParkour({ ...grounded(), crouched: true }, { x: 0, z: 0, jump: false }, settings,
        { ...queries, canStand: (...args) => { clearanceChecks++; return world.canStand(...args); } }, dt);
    assert.equal(clearanceChecks, 1);
    assert.equal(next.crouched, false, 'releasing crouch still checks clearance');
});

test('wall probes retain the preferred corner wall and return independent normals', () => {
    const world = collisionWorld([wall, { minX: -100, maxX: 100, minZ: -2, maxZ: -0.3, bottom: 0, top: 100 }]);
    const xWall = world.wallAt([0, 5, 0], 1.8, [1, 0]);
    const zWall = world.wallAt([0, 5, 0], 1.8, [0, 1]);
    assert.deepEqual(xWall, [1, 0]);
    assert.deepEqual(zWall, [0, 1]);
    assert.equal(world.wallAt([10, 5, 10], 1.8), null);
    assert.deepEqual(xWall, [1, 0], 'later queries cannot overwrite previous results');
});

describe('ground and air movement', () => {
    test('directional input accelerates from rest on ground, in air, and along a wall', () => {
        const input = { x: 0, z: -1, facingX: 0, facingZ: -1 };
        for (const [initial, world, limit] of [
            [grounded(), [floor], 13],
            [createParkourState([0, 100, 0]), [], 13],
            [createParkourState([0, 100, 0]), [{ ...wall, top: 200 }], 16.5],
        ]) {
            let state = initial;
            for (let tick = 0; tick < 120; tick++) {
                const before = speed(state);
                state = step(state, input, world);
                assert.ok(speed(state) >= before - 1e-4);
                assert.ok(speed(state) <= limit + 1e-4);
                assert.ok(state.velocity[1] < 0);
                close(state.velocity[0], 0);
            }
            close(speed(state), limit);
        }
    });

    test('running reaches base speed within 0.35 seconds, without diagonal advantage', () => {
        for (const input of [{ x: 1 }, { x: 1, z: 1 }]) {
            let state = grounded();
            for (let tick = 0; tick < 240; tick++) {
                state = step(state, input);
                assert.ok(speed(state) <= settings.speed + 1e-4);
                if (tick >= 41) close(speed(state), settings.speed);
            }
            assert.ok(Math.abs(speed(state) - settings.speed) < 1e-4);
        }
    });

    test('ground acceleration can reverse direction without rotating velocity instantly', () => {
        let state = { ...grounded(), velocity: [13, 0] };
        state = step(state, { x: -1 });
        assert.ok(state.velocity[0] > 0 && state.velocity[0] < 13);
        for (let tick = 0; tick < 240; tick++) state = step(state, { x: -1 });
        assert.ok(Math.abs(state.velocity[0] + 13) < 1e-4);
    });

    test('crouch boosts a run once, settles at crouch speed, and stops without input', () => {
        let state = { ...grounded(), velocity: [13, 0] };
        state = step(state, { x: 1, crouch: true });
        assert.ok(Math.abs(speed(state) - (16 - 14 * dt)) < 1e-4);
        for (let tick = 0; tick < 300; tick++) {
            const before = speed(state);
            state = step(state, { x: 1, crouch: true });
            assert.ok(speed(state) <= before);
        }
        assert.equal(speed(state), 5);
        for (let tick = 0; tick < 120; tick++) state = step(state, { crouch: true });
        assert.equal(speed(state), 0);
        state = step(state, { x: 1 });
        assert.ok(speed(state) > 0);
        let creeping = grounded();
        for (let tick = 0; tick < 120; tick++) creeping = step(creeping, { x: 1, crouch: true });
        assert.equal(speed(creeping), 5);
        // Re-entering crouch at walking speed must not repeatedly boost creeping.
        creeping = step({ ...creeping, crouched: false }, { x: 1, crouch: true });
        assert.equal(speed(creeping), 5);
    });

    test('ground jump adds vertical velocity, including while crouched', () => {
        for (const crouch of [false, true]) {
            const state = step({ ...grounded(), velocityY: 2 }, { jump: true, crouch });
            assert.ok(Math.abs(state.velocityY - (2 + settings.jumpSpeed - GRAVITY * dt)) < 1e-4);
            assert.deepEqual(state.velocity, [0, 0]);
            assert.equal(state.grounded, false);
        }
        let state = step(grounded(), { jump: true });
        let apex = 0;
        for (let tick = 0; tick < 240 && !state.grounded; tick++) {
            apex = Math.max(apex, state.position[1]);
            state = step(state);
        }
        assert.ok(apex > 1.3 && apex < 1.5);
        assert.equal(state.grounded, true);
    });

    test('airborne jump and crouch do not add impulses to directional acceleration', () => {
        const initial = { ...createParkourState([0, 10, 0]), velocity: [20, 5], velocityY: 2 };
        for (const crouch of [false, true]) {
            const state = step(initial, { x: -1, z: 1, jump: true, crouch });
            assert.deepEqual(state.velocity, step(initial, { x: -1, z: 1 }).velocity);
            assert.ok(Math.abs(state.velocityY - (2 - GRAVITY * dt)) < 1e-4);
        }
    });

    test('released wall contact blocks inward movement without latching or adding lift', () => {
        for (const crouch of [false, true]) {
            const initial = { ...createParkourState([0, 10, 0]), velocity: [-5, -13], velocityY: -2 };
            const state = step(initial, { crouch }, [floor, wall]);
            assert.ok(Math.abs(state.position[0]) < 1e-4);
            assert.equal(state.velocity[0], 0);
            assert.equal(state.velocity[1], -13);
            assert.ok(Math.abs(state.velocityY - (-2 - GRAVITY * dt)) < 1e-4);
        }
    });

    test('air steering follows a camera-relative turn while preserving carried speed', () => {
        let state = { ...createParkourState([0, 100, 0]), velocity: [30, 0] };
        for (let tick = 0; tick < 24; tick++) {
            state = step(state, { z: 1, facingX: 0, facingZ: 1 });
            close(speed(state), 30);
        }
        assert.ok(Math.atan2(state.velocity[1], state.velocity[0]) > 55 * Math.PI / 180);
        for (let tick = 0; tick < 96; tick++) state = step(state, { z: 1 });
        assert.ok(state.velocity[1] > 29.9);
        close(speed(state), 30);
        const coasting = step(state, { facingX: -1, facingZ: 0 });
        assert.deepEqual(coasting.velocity, state.velocity, 'camera movement alone does not steer without input');
    });

    test('a stationary jump can start moving when directional input arrives in midair', () => {
        for (const input of [{ x: 1 }, { z: -1 }, { x: 1, z: -1 }]) {
            let state = step(grounded(), { jump: true });
            close(speed(state), 0);
            for (let tick = 0; tick < 10; tick++) state = step(state);
            close(speed(state), 0);
            const before = [...state.position];
            state = step(state, input);
            assert.equal(state.grounded, false);
            assert.ok(speed(state) > 0, 'air input accelerates immediately from rest');
            assert.ok((state.position[0] - before[0]) * (input.x ?? 0)
                + (state.position[2] - before[2]) * (input.z ?? 0) > 0);
            for (let tick = 0; tick < 30; tick++) {
                state = step(state, input);
                assert.ok(speed(state) <= settings.speed + 1e-4);
            }
        }
    });

    test('air steering reverses within half a second without losing carried speed', () => {
        for (const crouch of [false, true]) {
            for (const side of [-1, 1]) {
                let state = { ...createParkourState([0, 100, 0]), velocity: [13, 0] };
                const angle = side * (Math.PI - 0.001);
                for (let tick = 0; tick < 60; tick++) {
                    state = step(state, { x: Math.cos(angle), z: Math.sin(angle), crouch });
                    close(speed(state), 13);
                    assert.equal(state.grounded, false);
                }
                assert.ok(state.velocity[0] < -12);
                assert.ok(state.velocity[1] * side > 0);
            }
        }
    });

    test('ground running turns more strongly than sliding', () => {
        const running = step({ ...grounded(), velocity: [30, 0] }, { z: 1 });
        const airborne = step({ ...createParkourState([0, 10, 0]), velocity: [30, 0] }, { z: 1 });
        const sliding = step({ ...grounded(), crouched: true, velocity: [30, 0] }, { z: 1, crouch: true });
        const heading = state => Math.atan2(state.velocity[1], state.velocity[0]);
        assert.ok(heading(airborne) > 0);
        assert.ok(heading(running) > heading(sliding));
        assert.ok(speed(running) < 30 && speed(sliding) < 30);
    });

    test('holding input settles excess speed at base while releasing input stops faster', () => {
        let running = { ...grounded(), velocity: [30, 0] };
        let stopping = structuredClone(running);
        const next = step(running, { x: 1 });
        assert.ok(speed(next) < 30 && speed(next) > settings.speed);
        for (let tick = 0; tick < 120; tick++) {
            running = step(running, { x: 1 });
            stopping = step(stopping);
        }
        assert.equal(speed(stopping), 0);
        close(speed(running), settings.speed);
        for (let tick = 0; tick < 240; tick++) running = step(running, { x: 1 });
        assert.ok(Math.abs(speed(running) - settings.speed) < 1e-4);
        for (let tick = 0; tick < 60; tick++) running = step(running, { x: 1 });
        assert.ok(Math.abs(speed(running) - settings.speed) < 1e-4);
    });

    test('falling changes vertical speed without adding horizontal momentum', () => {
        let state = { ...createParkourState([0, 100, 0]), velocity: [12, 16], velocityY: -2 };
        for (let tick = 0; tick < 120; tick++) state = step(state);
        assert.ok(Math.abs(speed(state) - 20) < 1e-4);
        assert.ok(Math.abs(state.velocity[0] / state.velocity[1] - 0.75) < 1e-4);
        assert.ok(Math.abs(state.velocityY - (-2 - GRAVITY)) < 1e-4);
        const verticalFall = step({ ...createParkourState([0, 10, 0]), velocityY: -2 });
        assert.deepEqual(verticalFall.velocity, [0, 0]);
    });

    test('landing and immediate jumping preserve horizontal momentum without ground braking', () => {
        let state = { ...createParkourState([0, 3, 0]), velocity: [20, 0], velocityY: -2 };
        while (!state.grounded) state = step(state);
        const landedSpeed = speed(state);
        assert.equal(landedSpeed, 20);
        state = step(state, { x: 1, jump: true });
        assert.equal(state.grounded, false);
        close(speed(state), landedSpeed);
        assert.ok(state.velocityY > 0);
    });

    test('ground jumps preserve run and slide speed; only slide entry boosts repeated hops', () => {
        const running = step({ ...grounded(), velocity: [13, 0] }, { x: 1, jump: true });
        assert.equal(speed(running), 13);
        const sliding = step({ ...grounded(), velocity: [13, 0] }, { x: 1, crouch: true, jump: true });
        close(speed(sliding), 16);
        let state = { ...grounded(), velocity: [13, 0] };
        for (let hop = 0; hop < 12; hop++) {
            state = step(state, { x: 1, crouch: true, jump: true });
            assert.ok(speed(state) <= 27);
            while (!state.grounded) state = step(state, { x: 1 });
        }
        assert.ok(speed(state) > 26.8);
    });

    test('early ground jump buffers through landing, but an expired press does not jump', () => {
        let state = { ...createParkourState([0, 0.1, 0]), velocityY: -5 };
        state = step(state, { jump: true });
        for (let tick = 0; tick < 6 && state.velocityY <= 0; tick++) state = step(state);
        assert.ok(state.velocityY > 0);
        assert.equal(state.jumpBuffer, 0);
        state = step({ ...createParkourState([0, 4, 0]), velocityY: -1 }, { jump: true });
        for (let tick = 0; tick < 180; tick++) state = step(state);
        assert.equal(state.grounded, true);
        assert.equal(state.velocityY, 0);
    });

    test('ground reversals brake through zero and settle at base speed', () => {
        let state = { ...grounded(), velocity: [13, 0] };
        let minimumSpeed = 13;
        for (let tick = 0; tick < 120; tick++) {
            state = step(state, { x: -1 });
            minimumSpeed = Math.min(minimumSpeed, speed(state));
            close(state.velocity[1], 0);
        }
        assert.ok(minimumSpeed < 1);
        close(state.velocity[0], -13);
    });

    test('ground friction removes sideways drift after a turn', () => {
        let state = { ...grounded(), velocity: [13, 0] };
        for (let tick = 0; tick < 480; tick++) state = step(state, { z: 1 });
        close(state.velocity[0], 0);
        close(state.velocity[1], 13);
    });

});

describe('wall latch rules', () => {
    const parallel = { x: 0, z: -1, facingX: 0, facingZ: -1 };
    const headOn = { x: -1, z: 0, facingX: -1, facingZ: 0 };
    const latch = (initial = besideWall(), input = parallel, world = [wall]) => wallStep(initial, input, world);

    test(`airborne contact auto-latches, but grounded contact does not`, () => {
        const world = collisionWorld([wall, floor]);
        const attached = latch(besideWall(), parallel, world);
        assert.deepEqual(attached.wallNormal, [1, 0]);
        assert.equal(attached.wallJumpAvailable, true);
        close(attached.velocityY, 0); // Wallrun entry clamps vertical motion once.
        const stopped = latch({ ...besideWall(), velocity: [0, 0] }, { ...parallel, x: 0, z: 0 }, world);
        assert.equal(stopped.wallNormal, null, 'contact requires forward input');
        const ground = step({ ...grounded(), velocity: [-3, -13] }, headOn, world);
        assert.equal(ground.wallNormal, null);
    });

    test(`oblique arrival redirects momentum and resolves remaining travel`, () => {
        const world = collisionWorld([wall]);
        const initial = { ...besideWall(), position: [0.09, 5, 0], velocity: [-12, -16] };
        const state = latch(initial, parallel, world);
        assert.deepEqual(state.wallNormal, [1, 0]);
        close(state.position[0], 0);
        close(speed(state), 20);
        assert.ok(state.position[2] < -16 * dt, 'redirected velocity drives the rest of the tick');
    });

    test('Ctrl releases the latch and cannot jump while airborne; releasing Ctrl permits fresh contact', () => {
        const attached = latch();
        const released = wallStep(attached, { ...parallel, crouch: true, jump: true });
        assert.equal(released.wallNormal, null);
        assert.equal(released.wallJumpAvailable, false);
        close(released.velocityY, attached.velocityY - GRAVITY * dt);
        let dropped = released;
        for (let i = 0; i < 20; i++) dropped = wallStep(dropped, { ...parallel, crouch: true });
        const reattached = latch(dropped);
        assert.deepEqual(reattached.wallNormal, [1, 0]);
        assert.equal(reattached.wallJumpAvailable, true);
        const releasedForward = latch(attached, { ...parallel, x: 0, z: 0 });
        assert.equal(releasedForward.wallNormal, null, 'releasing W unlatches');
        assert.equal(releasedForward.wallJumpAvailable, false);
    });

    test('looking into a latched wall turns a wallrun into a single powered climb', () => {
        let state = latch({ ...besideWall(), velocityY: 0 });
        state = latch(state, headOn);
        assert.ok(state.climbRemaining > 0);
        assert.ok(state.velocityY > 0);
        for (let i = 0; i < 100; i++) state = latch(state, headOn);
        assert.equal(state.climbRemaining, 0);
        assert.ok(state.velocityY < 0, 'spent climb falls under gravity');
        state = latch(state, parallel);
        state = latch(state, headOn);
        assert.equal(state.climbRemaining, 0, 'camera turns cannot refill support');
    });

    test('a climb gets one jump per latch, including repeated presses without releasing contact', () => {
        let state = { ...latch(besideWall(), headOn), climbRemaining: 0 };
        const before = state.velocityY;
        state = wallStep(state, { ...headOn, jump: true });
        close(state.velocityY, before + 4 - GRAVITY * dt);
        assert.deepEqual(state.wallNormal, [1, 0]);
        assert.equal(state.wallJumpAvailable, false);
        for (let i = 0; i < 12; i++) {
            const previous = state.velocityY;
            state = wallStep(state, { ...headOn, jump: true });
            close(state.velocityY, previous - GRAVITY * dt);
            assert.equal(state.wallJumpAvailable, false);
        }
    });

    test(`climb jumps renew only after releasing and reapplying forward input`, () => {
        const world = collisionWorld([wall]);
        let state = latch({ ...besideWall(), velocity: [0, 0] }, headOn, world);
        const startHeight = state.position[1];
        for (let cycle = 0; cycle < 8; cycle++) {
            state = step(state, { ...headOn, jump: true }, world);
            assert.deepEqual(state.wallNormal, [1, 0]);
            assert.equal(state.wallJumpAvailable, false);
            // Continued W and more jump presses cannot replenish the latch.
            state = step(state, { ...headOn, jump: true }, world);
            assert.equal(state.wallJumpAvailable, false);
            for (let tick = 0; tick < 16; tick++) {
                const previous = state;
                state = step(state, { ...headOn, x: 0, jump: false }, world);
                assert.equal(state.wallNormal, null);
                assert.equal(state.wallJumpAvailable, false);
                close(state.velocityY, previous.velocityY - GRAVITY * dt);
            }
            state = step(state, headOn, world);
            assert.deepEqual(state.wallNormal, [1, 0]);
            assert.equal(state.wallJumpAvailable, true);
        }
        assert.ok(state.position[1] > startHeight, 'repeated release/latch/jump cycles gain height');
    });

    test('a wallrun jump redirects carried speed away from any wall orientation', () => {
        for (const normal of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const wall = normal[0] ? {
                minX: normal[0] > 0 ? -2 : 0.3, maxX: normal[0] > 0 ? -0.3 : 2,
                minZ: -100, maxZ: 100, bottom: -100, top: 100,
            } : {
                minX: -100, maxX: 100, minZ: normal[1] > 0 ? -2 : 0.3,
                maxZ: normal[1] > 0 ? -0.3 : 2, bottom: -100, top: 100,
            };
            const tangent = [-normal[1], normal[0]];
            const initial = { ...createParkourState([0, 5, 0]), velocity: tangent.map(v => v * 20), velocityY: 3 };
            const input = { x: tangent[0], z: tangent[1], facingX: tangent[0], facingZ: tangent[1] };
            const attached = step(initial, input, [wall]);
            const jumped = step(attached, { ...input, jump: true }, [wall]);
            const outward = speed(attached) * Math.sin(Math.PI / 6) + 2;
            const along = speed(attached) * Math.cos(Math.PI / 6);
            close(jumped.velocity[0], tangent[0] * along + normal[0] * outward);
            close(jumped.velocity[1], tangent[1] * along + normal[1] * outward);
            close(jumped.velocityY, attached.velocityY + 4 - GRAVITY * dt);
            assert.equal(jumped.wallNormal, null);
            assert.equal(jumped.wallJumpAvailable, false);
        }
    });

    test('wall jump aim follows the camera and clamps shallow or inward aim to 30 degrees', () => {
        for (const side of [-1, 1]) for (const degrees of [-60, -30, 0, 15, 29.99, 30, 30.01, 60, 90]) {
            const angle = degrees * Math.PI / 180;
            const attached = latch({ ...besideWall(), velocity: [0, side * 20] });
            const jumped = step(attached, { x: Math.sin(angle), z: side * Math.cos(angle), jump: true, facingX: Math.sin(angle), facingZ: side * Math.cos(angle) }, [wall]);
            const expectedAngle = Math.max(Math.PI / 6, angle);
            close(jumped.velocity[0], Math.sin(expectedAngle) * speed(attached) + 2);
            close(jumped.velocity[1], side * Math.cos(expectedAngle) * speed(attached));
        }
    });

    test('wallrun entry clamps rising and falling motion only on attachment', () => {
        for (const velocityY of [-8, 8]) {
            const attached = latch({ ...besideWall(), velocityY });
            close(attached.velocityY, 0);
            const falling = latch({ ...attached, velocityY: -2 });
            close(falling.velocityY, -2 - GRAVITY * attached.wallTime ** 3 * dt);
        }
    });

    test('the departure margin cannot immediately rearm a wall jump', () => {
        let state = wallStep(latch(), { ...parallel, jump: true });
        for (let i = 0; i < 5; i++) {
            const before = state.velocityY;
            state = wallStep(state, { ...headOn, jump: true });
            assert.equal(state.wallNormal, null);
            assert.equal(state.wallJumpAvailable, false);
            close(state.velocityY, before - GRAVITY * dt);
        }
    });

    test('lost contact and landing clear the latch; a new wall grants a fresh jump', () => {
        const attached = latch();
        const departed = latch(attached, parallel, []);
        assert.equal(departed.wallNormal, null);
        assert.equal(departed.wallJumpAvailable, false);
        const attempt = wallStep(departed, { ...parallel, jump: true }, []);
        close(attempt.velocityY, departed.velocityY - GRAVITY * dt);
        const newContact = latch({ ...attempt, jumpBuffer: 0 });
        assert.equal(newContact.wallJumpAvailable, true);
        const landed = latch({ ...attached, position: [0, 0.01, 0], velocityY: -5 }, parallel, [wall, floor]);
        assert.equal(landed.grounded, true);
        assert.equal(landed.wallNormal, null);
        assert.equal(landed.wallJumpAvailable, false);
    });

    test('turning or pausing at a latched corner does not refill a spent climb jump', () => {
        const spent = { ...latch(besideWall(), headOn), wallJumpAvailable: false, climbRemaining: 0 };
        let state = spent;
        for (let i = 0; i < 20; i++) state = latch(state, i % 2 ? parallel : headOn);
        assert.equal(state.wallJumpAvailable, false);
        assert.equal(state.climbRemaining, 0);
    });
});

describe('wallrun camera guidance', () => {
    test('yaw follows the travel tangent smoothly on either wall and in either direction', () => {
        for (const normal of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (const direction of [-1, 1]) {
                const tx = -normal[1] * direction, tz = normal[0] * direction;
                const yaw = Math.atan2(-(tx * 0.8 - normal[0] * 0.6), -(tz * 0.8 - normal[1] * 0.6));
                const target = Math.atan2(-tx, -tz);
                const error = value => Math.abs(Math.atan2(Math.sin(target - value), Math.cos(target - value)));
                const next = wallrunYaw(yaw, normal, [tx * 13, tz * 13], dt);
                assert.ok(error(next) < error(yaw));
                assert.ok(error(next) > 0, 'assist must not snap to the tangent');
                let stepped = yaw;
                for (let tick = 0; tick < 60; tick++) stepped = wallrunYaw(stepped, normal, [tx * 13, tz * 13], dt);
                close(stepped, wallrunYaw(yaw, normal, [tx * 13, tz * 13], 60 * dt));
            }
        }
    });

    test('yaw never pulls outward aim back or turns inward during a reversal', () => {
        for (const normal of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (const direction of [-1, 1]) {
                const tx = -normal[1] * direction, tz = normal[0] * direction;
                for (const outward of [0.2, 0.6, 1]) {
                    const tangent = Math.sqrt(1 - outward ** 2);
                    const yaw = Math.atan2(-(tx * tangent + normal[0] * outward),
                        -(tz * tangent + normal[1] * outward));
                    close(wallrunYaw(yaw, normal, [tx * 13, tz * 13], dt), yaw);
                }
                const yaw = Math.atan2(-(tx * 0.8 - normal[0] * 0.6), -(tz * 0.8 - normal[1] * 0.6));
                const next = wallrunYaw(yaw, normal, [-tx * 13, -tz * 13], dt);
                const outward = value => -Math.sin(value) * normal[0] - Math.cos(value) * normal[1];
                assert.ok(outward(next) > outward(yaw), 'assist moves away even before momentum reverses');
            }
        }
    });

    test('head-on climbing, stopped contact and detached movement keep mouse aim', () => {
        for (const degrees of [-10, 0, 10]) {
            const yaw = Math.PI / 2 + degrees * Math.PI / 180;
            close(wallrunYaw(yaw, [1, 0], [0, -13], dt), yaw);
        }
        close(wallrunYaw(0.4, [1, 0], [0, 0], dt), 0.4);
        close(wallrunYaw(0.4, null, [0, -13], dt), 0.4);
        const adjustedByMouse = -0.2;
        close(wallrunYaw(adjustedByMouse, [1, 0], [0, -13], dt), adjustedByMouse);
    });
});
