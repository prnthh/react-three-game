import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { cameraRoll, wallrunYaw } from '../app/demo/jumper/camera.ts';
import { createJumperState, DEFAULT_MOVEMENT_SETTINGS, GRAVITY, stepJumper } from '../app/demo/jumper/movement.ts';
import { JUMPER_STEP as dt } from '../app/demo/jumper/simulation.ts';

import { SurfaceGrid } from '../app/demo/jumper/spatial.ts';

const settings = DEFAULT_MOVEMENT_SETTINGS;
const floor = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000, top: 0 };
const grounded = () => ({ ...createJumperState([0, 0, 0]), grounded: true });
const step = (state, input = {}, world = [floor]) => stepJumper(state, { x: 0, z: 0, jump: false, ...input }, settings, world, dt);
const speed = state => Math.hypot(...state.velocity);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const wall = { minX: -2, maxX: -0.3, minZ: -100, maxZ: 100, bottom: 0, top: 100, solid: true };
const besideWall = () => ({ ...createJumperState([0, 5, 0]), velocity: [0, -20], velocityY: 2 });
const wallStep = (state, input = {}, world = [wall]) => step(state,
    { x: -0.6, z: -0.8, facingX: -0.6, facingZ: -0.8, ...input }, world);

describe('ground and air movement', () => {
    test('directional input accelerates from rest on ground, in air, and along a wall', () => {
        const input = { x: 0, z: -1, facingX: 0, facingZ: -1 };
        for (const [initial, world, limit] of [
            [grounded(), [floor], 13],
            [createJumperState([0, 100, 0]), [], 13],
            [createJumperState([0, 100, 0]), [{ ...wall, top: 200 }], 16.5],
        ]) {
            let state = initial;
            for (let tick = 0; tick < 120; tick++) {
                const before = speed(state);
                state = step(state, input, world);
                assert.ok(speed(state) >= before - 1e-8);
                assert.ok(speed(state) <= limit + 1e-8);
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
                assert.ok(speed(state) <= settings.speed + 1e-9);
                if (tick >= 41) close(speed(state), settings.speed);
            }
            assert.ok(Math.abs(speed(state) - settings.speed) < 1e-9);
        }
    });

    test('ground acceleration can reverse direction without rotating velocity instantly', () => {
        let state = { ...grounded(), velocity: [13, 0] };
        state = step(state, { x: -1 });
        assert.ok(state.velocity[0] > 0 && state.velocity[0] < 13);
        for (let tick = 0; tick < 240; tick++) state = step(state, { x: -1 });
        assert.ok(Math.abs(state.velocity[0] + 13) < 1e-9);
    });

    test('crouch boosts a run once, settles at crouch speed, and stops without input', () => {
        let state = { ...grounded(), velocity: [13, 0] };
        state = step(state, { x: 1, crouch: true });
        assert.ok(Math.abs(speed(state) - (16 - 14 * dt)) < 1e-9);
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
            assert.ok(Math.abs(state.velocityY - (2 + settings.jumpSpeed - GRAVITY * dt)) < 1e-9);
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
        const initial = { ...createJumperState([0, 10, 0]), velocity: [20, 5], velocityY: 2 };
        for (const crouch of [false, true]) {
            const state = step(initial, { x: -1, z: 1, jump: true, crouch });
            assert.deepEqual(state.velocity, step(initial, { x: -1, z: 1 }).velocity);
            assert.ok(Math.abs(state.velocityY - (2 - GRAVITY * dt)) < 1e-9);
        }
    });

    test('wall collision alone blocks inward movement without latching or adding lift', () => {
        for (const crouch of [false, true]) {
            const initial = { ...createJumperState([0, 10, 0]), velocity: [-5, -13], velocityY: -2 };
            const state = step(initial, { crouch }, [floor, wall]);
            assert.ok(Math.abs(state.position[0]) < 1e-9);
            assert.equal(state.velocity[0], 0);
            assert.equal(state.velocity[1], -13);
            assert.ok(Math.abs(state.velocityY - (-2 - GRAVITY * dt)) < 1e-9);
        }
    });

    test('air steering follows a camera-relative turn while preserving carried speed', () => {
        let state = { ...createJumperState([0, 100, 0]), velocity: [30, 0] };
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
                assert.ok(speed(state) <= settings.speed + 1e-8);
            }
        }
    });

    test('air steering reverses within half a second without losing carried speed', () => {
        for (const crouch of [false, true]) {
            for (const side of [-1, 1]) {
                let state = { ...createJumperState([0, 100, 0]), velocity: [13, 0] };
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
        const airborne = step({ ...createJumperState([0, 10, 0]), velocity: [30, 0] }, { z: 1 });
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
        assert.ok(Math.abs(speed(running) - settings.speed) < 1e-9);
        for (let tick = 0; tick < 60; tick++) running = step(running, { x: 1 });
        assert.ok(Math.abs(speed(running) - settings.speed) < 1e-9);
    });

    test('falling changes vertical speed without adding horizontal momentum', () => {
        let state = { ...createJumperState([0, 100, 0]), velocity: [12, 16], velocityY: -2 };
        for (let tick = 0; tick < 120; tick++) state = step(state);
        assert.ok(Math.abs(speed(state) - 20) < 1e-9);
        assert.ok(Math.abs(state.velocity[0] / state.velocity[1] - 0.75) < 1e-9);
        assert.ok(Math.abs(state.velocityY - (-2 - GRAVITY)) < 1e-9);
        const verticalFall = step({ ...createJumperState([0, 10, 0]), velocityY: -2 });
        assert.deepEqual(verticalFall.velocity, [0, 0]);
    });

    test('landing and immediate jumping preserve horizontal momentum without ground braking', () => {
        let state = { ...createJumperState([0, 3, 0]), velocity: [20, 0], velocityY: -2 };
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
        let state = { ...createJumperState([0, 0.1, 0]), velocityY: -5 };
        state = step(state, { jump: true });
        for (let tick = 0; tick < 6 && state.velocityY <= 0; tick++) state = step(state);
        assert.ok(state.velocityY > 0);
        assert.equal(state.jumpBuffer, 0);
        state = step({ ...createJumperState([0, 4, 0]), velocityY: -1 }, { jump: true });
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

describe('wall contact, climbing and jumping', () => {
    test('climb drives toward the upward cap once per latch and rearms only after release', () => {
        const inward = { x: -1, z: 0, facingX: -1, facingZ: 0 };
        for (const velocityY of [-8, 0, 2, 4]) {
            let state = { ...besideWall(), velocity: [0, 0], velocityY };
            for (let tick = 0; tick < 30; tick++) {
                state = wallStep(state, inward);
                assert.ok(state.velocityY <= 4 + 1e-8);
            }
            close(state.velocityY, 4);
            for (let tick = 0; tick < 100; tick++) state = wallStep(state, inward);
            close(state.climbRemaining, 0);
            assert.ok(state.velocityY < 0);
            state = wallStep(state, { x: 0, z: -1, facingX: 0, facingZ: -1 });
            const before = state.velocityY;
            state = wallStep(state, inward);
            close(state.velocityY, before - GRAVITY * dt);
            close(state.climbRemaining, 0, 'turning does not rearm');
            for (const release of [{ crouch: true }, { detach: true }]) {
                const dropped = wallStep(state, { ...inward, ...release });
                assert.equal(dropped.climbRemaining, null);
                const resumed = wallStep(dropped, inward);
                assert.ok(resumed.climbRemaining > 0);
                assert.ok(resumed.velocityY > dropped.velocityY);
            }
        }
    });

    test('release, jump, then forward repeats climbs through ordinary contact rules', () => {
        const inward = { x: -1, z: 0, facingX: -1, facingZ: 0 };
        let state = { ...besideWall(), position: [0, 30, 0], velocity: [0, 0], velocityY: 0 };
        for (let cycle = 0; cycle < 3; cycle++) {
            state = wallStep(state, inward);
            assert.ok(state.climbRemaining > 0);
            for (let tick = 0; tick < 120; tick++) state = wallStep(state, inward);
            close(state.climbRemaining, 0);
            state = wallStep(state, { ...inward, x: 0 });
            assert.equal(state.wallNormal, null);
            assert.equal(state.climbRemaining, null);
            const before = state.velocityY;
            state = wallStep(state, { ...inward, x: 0, jump: true });
            close(state.velocityY, before + 4 - GRAVITY * dt);
            assert.equal(state.wallNormal, null);
        }
        state = wallStep(state, inward);
        state = wallStep(state, { x: 1, z: 0, facingX: 1, facingZ: 0 });
        assert.equal(state.wallNormal, null, 'facing away releases a climb');
        assert.equal(state.climbRemaining, null);
    });

    test('above-cap climb entry preserves ascent and does not activate later during the same latch', () => {
        const inward = { x: -1, z: 0, facingX: -1, facingZ: 0 };
        let state = { ...besideWall(), velocity: [0, 0], velocityY: 8 };
        for (let tick = 0; tick < 60; tick++) {
            const before = state.velocityY;
            state = wallStep(state, inward);
            close(state.velocityY, before - GRAVITY * dt);
            close(state.climbRemaining, 0);
        }
    });

    for (const indexed of [false, true]) {
        test(`airborne contact automatically starts a wallrun (${indexed ? 'grid' : 'array'})`, () => {
            const world = indexed ? new SurfaceGrid([wall]) : [wall];
            const state = wallStep(besideWall(), {}, world);
            assert.deepEqual(state.wallNormal, [1, 0]);
            close(state.velocity[0], 0); close(state.velocity[1], -20);
            close(state.velocityY, 0);

            assert.equal(wallStep({ ...besideWall(), grounded: true }, {}, world).wallNormal, null);
            assert.equal(wallStep({ ...besideWall(), position: [1, 5, 0] }, {}, world).wallNormal, null);
            const arriving = wallStep({ ...besideWall(), position: [0.09, 5, 0], velocity: [-12, -16] }, {}, world);
            assert.deepEqual(arriving.wallNormal, [1, 0], 'swept collision attaches on the arrival tick');
            close(arriving.velocityY, state.velocityY);
            close(arriving.wallTime, state.wallTime);
            close(Math.hypot(...arriving.velocity), 20);
        });
    }

    test('crouch and right click drop; resuming forward contact reattaches', () => {
        for (const release of [{ crouch: true }, { detach: true }]) {
            const latched = wallStep(besideWall());
            const dropped = wallStep(latched, { ...release, x: 0, z: -1 });
            assert.equal(dropped.wallNormal, null);
            assert.deepEqual(dropped.velocity, latched.velocity);
            close(dropped.velocityY, latched.velocityY - GRAVITY * dt);
            assert.deepEqual(wallStep(dropped).wallNormal, [1, 0]);
            assert.equal(wallStep(besideWall(), release).wallNormal, null);
        }
    });

    test('fast oblique wallrun entry redirects full horizontal speed and preserves it through angled input', () => {
        for (const world of [[wall], new SurfaceGrid([wall])]) {
            for (const x of [0, 0.09]) {
                for (const velocity of [[-24, -18], [-18, -24], [-24, 18]]) {
                    const direction = Math.sign(velocity[1]);
                    const input = { x: -0.6, z: direction * 0.8, facingX: -0.6, facingZ: direction * 0.8 };
                    let state = wallStep({ ...besideWall(), position: [x, 20, 0], velocity }, input, world);
                    assert.deepEqual(state.wallNormal, [1, 0]);
                    close(speed(state), 30);
                    close(state.velocity[0], 0);
                    for (let tick = 0; tick < 60; tick++) state = wallStep(state, input, world);
                    close(speed(state), 30);
                    const jumped = wallStep(state, { ...input, jump: true }, world);
                    close(Math.hypot(jumped.velocity[0] - 2, jumped.velocity[1]), 30);
                    assert.equal(jumped.wallNormal, null);
                    const blocked = wallStep({ ...besideWall(), position: [x, 20, 0], velocity },
                        { ...input, x: 0, z: 0, crouch: true }, world);
                    close(speed(blocked), Math.abs(velocity[1]));
                    assert.equal(blocked.wallNormal, null, 'ordinary collisions still remove inward speed');
                }
            }
        }
    });

    test('wallrun collision uses the conserved velocity for the remainder of the arrival tick', () => {
        const input = { x: -0.6, z: -0.8, facingX: -0.6, facingZ: -0.8 };
        for (const world of [[wall], new SurfaceGrid([wall])]) {
            const state = wallStep({ ...besideWall(), position: [0.09, 20, 0], velocity: [-18, -24] }, input, world);
            const hitTime = 0.09 / 18;
            close(state.position[0], 0);
            close(state.position[2], -24 * hitTime - 30 * (dt - hitTime));
            close(state.velocity[1], -30);
        }
    });

    test('wall acceleration reaches the observed horizontal speed before the small normal jump impulse', () => {
        const input = { x: 0, z: -1, facingX: 0, facingZ: -1 };
        for (const world of [[wall], new SurfaceGrid([wall])]) {
            let state = wallStep({ ...besideWall(), velocity: [0, -13] }, input, world);
            for (let tick = 0; tick < 12; tick++) state = wallStep(state, input, world);
            close(speed(state), 16.5);
            const jumped = wallStep(state, { ...input, jump: true }, world);
            close(Math.hypot(jumped.velocity[0] - 2, jumped.velocity[1]), 16.5);
            assert.equal(jumped.wallNormal, null);
            const fast = wallStep({ ...besideWall(), velocity: [0, -30] }, input, world);
            close(speed(fast), 30, 'parallel wall movement preserves excess speed');
        }
    });

    test('attached turning preserves speed until braking or reversing without resetting support', () => {
        for (const world of [[wall], new SurfaceGrid([wall])]) {
            const parallel = { x: 0, z: -1, facingX: 0, facingZ: -1 };
            let state = wallStep({ ...besideWall(), velocity: [0, -13] }, parallel, world);
            const outward = { x: 0.8, z: -0.6, facingX: 0.8, facingZ: -0.6 };
            const age = state.wallTime;
            const carried = speed(state);
            for (let tick = 0; tick < 30; tick++) state = wallStep(state, outward, world);
            assert.deepEqual(state.wallNormal, [1, 0]);
            close(state.velocity[1], -carried);
            close(state.wallTime, age + 30 * dt);
            const reverse = { x: 0.6, z: 0.8, facingX: 0.6, facingZ: 0.8 };
            for (let tick = 0; tick < 60; tick++) state = wallStep(state, reverse, world);
            assert.deepEqual(state.wallNormal, [1, 0]);
            close(state.velocity[1], 16.5 * 0.8);
            for (let tick = 0; tick < 40; tick++) {
                state = wallStep(state, { x: -1, z: 0, facingX: -1, facingZ: 0 }, world);
            }
            assert.deepEqual(state.wallNormal, [1, 0]);
            close(state.velocity[1], 0, 'facing into the wall stops sideways travel');
            const idle = wallStep(state, { x: 0, z: 0 }, world);
            assert.equal(idle.wallNormal, null, 'releasing W unlatches');
            assert.equal(idle.climbRemaining, null);
            assert.equal(wallStep(idle, { ...parallel, jump: true }, world).wallNormal, null);
            assert.equal(wallStep(besideWall(), outward, world).wallNormal, null,
                'outward input cannot start a new latch');
        }
    });

    test('wall jump redirects carried speed toward outward look', () => {
        const latched = wallStep(besideWall());
        const jumped = wallStep(latched, { jump: true, x: 0.6, z: -0.8, facingX: 0.6 });
        assert.equal(jumped.wallNormal, null);
        close(jumped.velocity[0], speed(latched) * 0.6 + 2); close(jumped.velocity[1], -speed(latched) * 0.8);
        close(jumped.velocityY, latched.velocityY + 4 - GRAVITY * dt);
        assert.equal(wallStep(jumped, { x: 0.6, facingX: 0.6 }).wallNormal, null);
        const inward = wallStep(latched, { jump: true, x: -1, z: 0, facingX: -1, facingZ: 0 });
        close(inward.velocityY, latched.velocityY + 4 - GRAVITY * dt);
        close(inward.velocity[0], 0, 'collision blocks an inward-looking impulse');
    });

    test('wall jumps redirect carried speed then add the normal impulse at any wall orientation', () => {
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const tx = -nz, tz = nx;
            const corners = [[wall.minX, wall.minZ], [wall.minX, wall.maxZ],
                [wall.maxX, wall.minZ], [wall.maxX, wall.maxZ]]
                .map(([x, z]) => [x * nx + z * tx, x * nz + z * tz]);
            const surface = { ...wall, minX: Math.min(...corners.map(p => p[0])), maxX: Math.max(...corners.map(p => p[0])),
                minZ: Math.min(...corners.map(p => p[1])), maxZ: Math.max(...corners.map(p => p[1])) };
            for (const carried of [0, 13, 30]) {
                const initial = { ...createJumperState([0, 50, 0]), wallNormal: [nx, nz],
                    velocity: [tx * carried, tz * carried], velocityY: -6 };
                const x = 0.6 * nx + 0.8 * tx, z = 0.6 * nz + 0.8 * tz;
                const jumped = step(initial, { x: 0, z: 0, facingX: x, facingZ: z, jump: true }, [surface]);
                const acceleratedSpeed = carried;
                close(jumped.velocity[0], x * acceleratedSpeed + nx * 2);
                close(jumped.velocity[1], z * acceleratedSpeed + nz * 2);
                close(jumped.velocityY, initial.velocityY + 4 - GRAVITY * dt);
                assert.equal(jumped.wallNormal, null);
            }
        }
    });

    test('camera turning cannot instantly reverse a wallrun or convert horizontal speed into lift', () => {
        const latched = wallStep(besideWall());
        const reversedView = wallStep(latched, { z: 0.8, facingZ: 0.8 });
        assert.ok(reversedView.velocity[1] < 0);
        assert.ok(Math.hypot(...reversedView.velocity) < 20, 'opposite movement brakes before reversing');
        const climbing = wallStep(latched, { x: -1, z: 0, facingX: -1, facingZ: 0 });
        assert.ok(Math.hypot(...climbing.velocity) < Math.hypot(...latched.velocity), 'head-on input brakes along-wall travel');
        assert.ok(climbing.velocityY > latched.velocityY);
        const slow = wallStep({ ...latched, velocity: [0, 0] }, { x: -1, z: 0, facingX: -1, facingZ: 0 });
        close(climbing.velocityY, slow.velocityY, 'climb drive does not convert horizontal speed');
        const headOn = wallStep({ ...besideWall(), velocity: [-20, 0] }, { x: -1, z: 0, facingX: -1, facingZ: 0 });
        close(Math.hypot(...headOn.velocity), 0);
    });

    test('latching resets a fall once; jumping afterward adds vertical impulse', () => {
        const input = { x: 0, z: -1, facingX: 0, facingZ: -1 };
        let state = wallStep({ ...besideWall(), velocityY: -12 }, input);
        close(state.velocityY, 0, 'parallel wallrun entry arrests the fall');
        for (let tick = 0; tick < 60; tick++) state = wallStep(state, input);
        assert.ok(state.velocityY < 0, 'gravity resumes during sustained support');
        const jumped = wallStep(state, { ...input, jump: true });
        close(jumped.velocityY, state.velocityY + 4 - GRAVITY * dt);
        close(jumped.velocity[0], speed(state) * 0.5 + 2);
        close(Math.hypot(jumped.velocity[0] - 2, jumped.velocity[1]), speed(state));
    });

    test('crouch and right-click allow repeated release/jump/reattach climbs', () => {
        const inward = { x: -1, z: 0, facingX: -1, facingZ: 0 };
        for (const release of [{ crouch: true }, { detach: true }]) {
            let state = wallStep({ ...besideWall(), velocity: [0, 0] }, inward);
            for (let cycle = 0; cycle < 5; cycle++) {
                const y = state.position[1];
                state = wallStep(state, { ...inward, ...release });
                assert.equal(state.wallNormal, null);
                const before = state.velocityY;
                state = wallStep(state, { ...inward, x: 0, jump: true });
                close(state.velocityY, before + 4 - GRAVITY * dt);
                for (let tick = 0; tick < 30; tick++) state = wallStep(state, inward);
                assert.deepEqual(state.wallNormal, [1, 0]);
                assert.ok(state.position[1] > y);
            }
        }
    });

    test('head-on jumps stay inline while parallel wallruns separate', () => {
        for (const input of [{ x: -1, z: 0, facingX: -1, facingZ: 0 }, { x: 0, z: -1, facingX: 0, facingZ: -1 }]) {
            const state = wallStep(besideWall(), input);
            const jumped = wallStep(state, { ...input, jump: true });
            const separation = input.x === -1 ? 0 : speed(state) * 0.5 + 2;
            close(jumped.velocity[0], separation);
            close(jumped.position[0], state.position[0] + separation * dt);
            close(jumped.velocityY, state.velocityY + 4 - GRAVITY * dt);
            assert.equal(jumped.wallNormal, null, 'the jump releases support for the launch tick');
        }
    });

    test('slightly angled climb jumps reattach after W release without an outward kick', () => {
        for (const degrees of [-15, -5, -1, 0, 1, 5, 15]) {
            const angle = degrees * Math.PI / 180;
            const input = { x: -Math.cos(angle), z: Math.sin(angle), facingX: -Math.cos(angle), facingZ: Math.sin(angle) };
            let state = { ...besideWall(), velocity: [13 * input.x, 13 * input.z] };
            for (let cycle = 0; cycle < 3; cycle++) {
                for (let tick = 0; tick < 90; tick++) state = wallStep(state, input);
                assert.deepEqual(state.wallNormal, [1, 0], `${degrees}: climb attached`);
                for (let tick = 0; tick < 6; tick++) state = wallStep(state, { ...input, x: 0, z: 0 });
                assert.equal(state.wallNormal, null, 'releasing W drops the latch');
                const before = state.velocityY;
                state = wallStep(state, { ...input, x: 0, z: 0, jump: true });
                close(state.velocityY, before + 4 - GRAVITY * dt);
                close(state.velocity[0], 0);
                state = wallStep(state, input);
                assert.deepEqual(state.wallNormal, [1, 0], `${degrees}: W resumes climb after jump`);
                close(state.wallTime, dt);
            }
        }
    });

    test('lost contact and landing clear attachment', () => {
        const latched = wallStep(besideWall());
        assert.equal(wallStep(latched, {}, []).wallNormal, null);
        const floor = { minX: -100, maxX: 100, minZ: -100, maxZ: 100, top: 0 };
        const landed = wallStep({ ...latched, position: [0, 0.01, 0], velocityY: -5 }, {}, [wall, floor]);
        assert.equal(landed.grounded, true);
        assert.equal(landed.wallNormal, null);
    });

    test('a stopped outward wall jump gets the small normal impulse', () => {
        const state = wallStep({ ...besideWall(), velocity: [0, 0], wallNormal: [1, 0] },
            { jump: true, x: 1, z: 0, facingX: 1, facingZ: 0 });
        close(state.velocity[0], 2 + 20 * dt); close(state.velocity[1], 0);
        assert.ok(state.velocityY > 0);
        assert.equal(state.wallNormal, null);
    });

    for (const indexed of [false, true]) {
        test(`wall transfers attach without another jump and retain the small kick (${indexed ? 'grid' : 'array'})`, () => {
            const opposite = { ...wall, minX: 3.3, maxX: 5 };
            const world = indexed ? new SurfaceGrid([wall, opposite]) : [wall, opposite];
            let state = wallStep(besideWall(), {}, world);
            for (const direction of [1, -1, 1, -1]) {
                const input = { x: direction * 0.6, z: -0.8, facingX: direction * 0.6, facingZ: -0.8 };
                const speed = Math.hypot(...state.velocity);
                state = wallStep(state, { ...input, jump: true }, world);
                assert.equal(state.wallNormal, null);
                for (let tick = 0; tick < 360 && !state.wallNormal; tick++) state = wallStep(state, input, world);
                assert.ok(state.wallNormal, 'reach the next wall');
                close(state.wallNormal[0], -direction);
                assert.ok(Math.hypot(...state.velocity) <= Math.max(16.5, speed + 2) + 1e-8);
                assert.ok(state.velocity[1] < 0, 'keep forward travel through the transfer');
            }
        });
    }

    test('strafe-only input cannot count as holding forward through floating-point roundoff', () => {
        const facingX = -Math.sin(0.731), facingZ = -Math.cos(0.731);
        const state = wallStep(besideWall(), { x: -facingZ, z: facingX, facingX, facingZ });
        assert.equal(state.wallNormal, null);
    });

    test('jump needs current support; a press after losing the wall stays buffered', () => {
        const latched = wallStep(besideWall());
        const departed = wallStep(latched, {}, []);
        const jumped = wallStep(departed, { jump: true }, []);
        assert.equal(jumped.wallNormal, null);
        close(jumped.velocityY, departed.velocityY - GRAVITY * dt);
        assert.ok(jumped.jumpBuffer > 0);
        const arrived = wallStep(jumped);
        close(arrived.velocityY, jumped.velocityY + 4 - GRAVITY * dt);
        assert.equal(arrived.jumpBuffer, 0, 'contact consumes the buffered jump');
    });

    test('wall tilt leans away and mirrors left/right, works after rotating the scene, and fades during a head-on climb', () => {
        const left = cameraRoll(0, [1, 0], 0, -1);
        const right = cameraRoll(0, [-1, 0], 0, -1);
        assert.ok(left < 0);
        close(right, -left);
        close(cameraRoll(0, [0, 1], 1, 0), left);
        close(cameraRoll(0, [1, 0], -1, 0), 0);
        close(cameraRoll(0, null, 0, -1), 0);
    });

    test('a stopped head-on climb can move sideways and reverse using movement input', () => {
        const inward = { x: -1, z: 0, facingX: -1, facingZ: 0 };
        let state = wallStep({ ...besideWall(), velocity: [-20, 0] }, inward);
        close(Math.hypot(...state.velocity), 0);
        const x = state.position[0], z = state.position[2];
        for (let tick = 0; tick < 60; tick++) state = wallStep(state, { ...inward, z: 1 });
        assert.ok(state.position[2] > z + 1);
        assert.ok(state.velocity[1] > 0);
        close(state.position[0], x);
        assert.deepEqual(state.wallNormal, [1, 0]);
        state = wallStep(state, { ...inward, z: -1 });
        assert.ok(state.velocity[1] > 0, 'reversal must not snap');
        for (let tick = 0; tick < 60; tick++) state = wallStep(state, { ...inward, z: -1 });
        assert.ok(state.velocity[1] < 0);
        close(state.position[0], x);
        assert.deepEqual(state.wallNormal, [1, 0]);
    });

    test('inward-looking wallrun jump clamps direction without adding speed', () => {
        const latched = wallStep(besideWall());
        const jumped = wallStep(latched, { jump: true });
        assert.equal(jumped.wallNormal, null);
        close(jumped.velocity[0], speed(latched) * 0.5 + 2);
        assert.ok(jumped.velocity[1] < 0, 'retain forward travel');
        assert.ok(jumped.velocity[1] < -15, 'keep most of the along-wall momentum');
        close(Math.hypot(jumped.velocity[0] - 2, jumped.velocity[1]), speed(latched));
        close(jumped.velocityY, latched.velocityY + 4 - GRAVITY * dt);
    });

    test('wall jumps add lift to rising or falling motion even when horizontal aim is blocked', () => {
        const inward = { x: -1, z: 0, facingX: -1, facingZ: 0 };
        for (const velocityY of [-12, -8, 0, 3, 12]) {
            for (const wallNormal of [[1, 0], null]) {
                const initial = { ...besideWall(), velocity: [0, 0], velocityY, wallNormal };
                for (const x of [-1, 0]) {
                    const jumped = wallStep(initial, { ...inward, x, jump: true });
                    close(jumped.velocityY, velocityY + 4 - GRAVITY * dt);
                    close(Math.hypot(...jumped.velocity), 0);
                }
            }
        }
    });

    test('an early jump survives crossing a narrow gap and fires once on the opposite wall', () => {
        const opposite = { ...wall, minX: 0.6, maxX: 3 };
        const world = [wall, opposite];
        let state = wallStep(besideWall(), {}, world);
        const across = { x: 0.2, z: -Math.sqrt(0.96), facingX: 0.2, facingZ: -Math.sqrt(0.96) };
        state = wallStep(state, { ...across, jump: true }, world);
        const firstSpeed = Math.hypot(...state.velocity);
        const vy = state.velocityY;
        state = wallStep(state, { ...across, jump: true }, world);
        assert.ok(state.jumpBuffer > 0, 'departing wall must not consume the next press');
        assert.ok(state.velocityY < vy, 'no extra jump on the departing wall');
        const returnAim = { ...across, facingX: -0.2 };
        for (let tick = 0; tick < 20 && state.jumpBuffer > 0; tick++) state = wallStep(state, returnAim, world);
        assert.equal(state.jumpBuffer, 0);
        assert.ok(state.velocity[0] < 0, 'buffered jump kicks off the opposite wall');
        assert.ok(Math.hypot(...state.velocity) <= firstSpeed + 2 + 1e-8);
        const next = wallStep(state, across, world);
        assert.ok(next.velocityY < state.velocityY, 'one press cannot jump twice');
    });

    test('a shallow kick is not immediately recaptured by the wall contact margin', () => {
        const forward = { x: -0.05, z: -Math.sqrt(1 - 0.05 ** 2), facingX: -0.05, facingZ: -Math.sqrt(1 - 0.05 ** 2) };
        const latched = wallStep({ ...besideWall(), velocity: [0, -13] }, forward);
        let state = wallStep(latched, { ...forward, x: 0.05, facingX: 0.05, jump: true });
        assert.ok(state.position[0] > 0, 'outward look moves away from the wall');
        for (let tick = 0; tick < 3; tick++) {
            state = wallStep(state, forward);
            assert.equal(state.wallNormal, null);
            assert.ok(state.velocity[0] > 0);
        }
    });

    test('turning into a climb starts its one powered interval', () => {
        const initial = { ...besideWall(), wallNormal: [1, 0] };
        const glancing = wallStep(initial);
        const headOn = wallStep(initial, { facingX: -1, facingZ: 0 });
        assert.deepEqual(headOn.velocity, glancing.velocity);
        assert.ok(headOn.velocityY > glancing.velocityY);
        assert.ok(headOn.climbRemaining > 0);
    });

    test('jump direction follows outward look and clamps shallow aim', () => {
        const initial = { ...besideWall(), wallNormal: [1, 0] };
        for (const degrees of [-60, -30, 0, 15, 29.99, 30, 30.01, 60, 90]) {
            for (const side of [-1, 1]) {
                const angle = degrees * Math.PI / 180;
                const x = Math.sin(angle), z = side * Math.cos(angle);
                const held = wallStep(initial, { x, z, facingX: x, facingZ: z, jump: true });
                const released = wallStep(initial, { x: 0, z: 0, facingX: x, facingZ: z, jump: true });
                close(Math.hypot(released.velocity[0] - 2, released.velocity[1]), speed(initial));
                const launchAngle = Math.atan2(held.velocity[0] - 2, Math.abs(held.velocity[1]));
                close(launchAngle, Math.max(30, degrees) * Math.PI / 180);
                assert.equal(Math.sign(held.velocity[1]), side);
            }
        }
    });

    test('one climb angle check selects inline lift or speed-preserving separation', () => {
        const initial = { ...besideWall(), wallNormal: [1, 0] };
        for (const side of [-1, 1]) {
            for (const degrees of [0, 5, 14.99, 15, 15.01, 30, 60, 90, 120, 180]) {
                const angle = degrees * Math.PI / 180;
                const x = -Math.cos(angle), z = side * Math.sin(angle);
                const jumped = wallStep(initial, { x: 0, z: 0, facingX: x, facingZ: z, jump: true });
                if (degrees <= 15) {
                    assert.deepEqual(jumped.velocity, initial.velocity, 'climb jump adds only lift');
                } else {
                    assert.ok(jumped.velocity[0] >= speed(initial) * 0.5 - 1e-8);
                    close(Math.hypot(jumped.velocity[0] - 2, jumped.velocity[1]), speed(initial));
                }
                close(jumped.velocityY, initial.velocityY + 4 - GRAVITY * dt);
                assert.equal(jumped.wallNormal, null);
            }
        }
    });

    test('near-parallel camera aim does not prevent automatic opposite-wall attachment', () => {
        const opposite = { ...wall, minX: 0.9, maxX: 3 };
        for (const world of [[wall, opposite], new SurfaceGrid([wall, opposite])]) {
            const forward = { x: 0, z: -1, facingX: 0, facingZ: -1 };
            let state = wallStep(besideWall(), forward, world);
            state = wallStep(state, { x: 0.6, z: -0.8, facingX: 0.6, facingZ: -0.8, jump: true }, world);
            assert.equal(state.wallNormal, null);
            // Slightly face away from the destination while momentum carries us there.
            const aim = { x: -0.05, z: -Math.sqrt(0.9975), facingX: -0.05, facingZ: -Math.sqrt(0.9975) };
            for (let tick = 0; tick < 60 && !state.wallNormal; tick++) state = wallStep(state, aim, world);
            assert.ok(state.wallNormal);
            close(state.wallNormal[0], -1); close(state.wallNormal[1], 0);
            assert.ok(state.velocity[1] < 0);
            const next = wallStep(state, aim, world);
            assert.deepEqual(next.wallNormal, state.wallNormal, 'remain attached without another jump');
        }
    });

    test('wallrun release and reattachment do not create upward momentum', () => {
        for (const inward of [0, 0.05, 0.1, 0.3]) {
            const input = { x: -inward, z: -Math.sqrt(1 - inward ** 2),
                facingX: -inward, facingZ: -Math.sqrt(1 - inward ** 2) };
            for (const velocityY of [-2, 0, 2]) {
                let state = { ...besideWall(), velocityY };
                for (let cycle = 0; cycle < 5; cycle++) {
                    const before = state.velocityY;
                    state = wallStep(state, input);
                    assert.ok(state.velocityY >= 0 && state.velocityY <= Math.max(0, before));
                    for (let tick = 0; tick < 60; tick++) state = wallStep(state, input);
                    state = wallStep(state, { ...input, detach: true });
                }
                if (velocityY <= 0) assert.ok(state.position[1] <= besideWall().position[1]);
            }
        }
    });

    test('wallrun jump creates separation but steering back still reattaches', () => {
        const parallel = { x: 0, z: -1, facingX: 0, facingZ: -1 };
        const world = [{ ...wall, top: 200 }];
        let state = wallStep({ ...createJumperState([0, 100, 0]), velocity: [0, -13] }, parallel, world);
        const launchSpeed = speed(state);
        state = wallStep(state, { x: 0, z: 0, facingX: 1, facingZ: 0, jump: true }, world);
        close(state.velocity[0], launchSpeed + 2); close(state.velocity[1], 0);
        for (let tick = 0; tick < 24; tick++) {
            state = wallStep(state, { ...parallel, x: 0, z: 0 }, world);
            assert.equal(state.wallNormal, null);
        }
        close(state.position[0], (launchSpeed + 2) * 25 * dt, 'unsteered separation follows redirected speed');
        for (let tick = 0; tick < 360 && !state.wallNormal; tick++) {
            state = wallStep(state, { x: -1, z: 0, facingX: -1, facingZ: 0 }, world);
        }
        assert.deepEqual(state.wallNormal, [1, 0], 'steering back can start another wallrun');
    });

    test('running into an isolated wall at a small angle does not build full sideways speed before climbing', () => {
        const floor = { minX: -100, maxX: 100, minZ: -100, maxZ: 100, top: 0 };
        const ledge = { minX: -100, maxX: 100, minZ: -5, maxZ: -0.3, bottom: 0, top: 4, solid: true };
        for (const world of [[floor, ledge], new SurfaceGrid([floor, ledge])]) {
            for (const degrees of [-30, -10, -5, 0, 5, 10, 30]) {
                const angle = degrees * Math.PI / 180;
                const input = { x: Math.sin(angle), z: -Math.cos(angle), facingX: Math.sin(angle), facingZ: -Math.cos(angle) };
                let state = { ...createJumperState([0, 0, 0]), grounded: true };
                for (let tick = 0; tick < 120; tick++) state = wallStep(state, input, world);
                assert.equal(state.wallNormal, null, 'grounded running must not latch');
                const sideways = settings.speed * Math.abs(input.x);
                assert.ok(Math.abs(state.velocity[0]) <= sideways + 1e-8, `${degrees}: collision must not amplify sideways input`);
                state = wallStep(state, { ...input, jump: true }, world);
                for (let tick = 0; tick < 12; tick++) state = wallStep(state, input, world);
                close(state.wallNormal?.[0], 0); close(state.wallNormal?.[1], 1);
                if (Math.abs(degrees) <= 15) assert.ok(state.velocityY > 2.9, `${degrees}: head-on entry retains climb rise`);
                else assert.ok(state.velocityY <= 0, `${degrees}: wallrun entry does not retain climb rise`);
                assert.ok(Math.abs(state.velocity[0]) <= 16.5 * Math.abs(input.x) + 1e-8,
                    'wall acceleration respects the small lateral input instead of building full sideways speed');
            }
        }
    });

    test('a swept corner hit validates its own surface and keeps that contact on following ticks', () => {
        const front = { minX: -2, maxX: 10, minZ: -10, maxZ: -0.3, bottom: 0, top: 20, solid: true };
        const forward = { x: 0, z: -1, facingX: 0, facingZ: -1 };
        for (const surfaces of [[wall, front], [front, wall]]) {
            for (const world of [surfaces, new SurfaceGrid(surfaces)]) {
                let state = wallStep({ ...besideWall(), position: [0, 5, 0.09], wallNormal: [1, 0], wallTime: 1 }, forward, world);
                close(state.wallNormal?.[0], 0); close(state.wallNormal?.[1], 1);
                assert.ok(state.climbRemaining > 0);
                for (let tick = 0; tick < 12; tick++) {
                    state = wallStep(state, forward, world);
                    close(state.wallNormal?.[0], 0); close(state.wallNormal?.[1], 1);
                }
                assert.ok(state.wallTime > 12 * dt, 'other nearby faces must not reset contact age');
            }
        }
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
