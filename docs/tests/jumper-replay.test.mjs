import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceJumper, createJumperSimulation, JUMPER_STEP } from '../app/demo/jumper/movement.ts';
import { createAttempt, createRecorder, createReplay, stepReplay } from '../app/demo/jumper/replay.ts';

const settings = { speed: 13, jumpSpeed: 9, slideBoost: 3, jumpBoost: 1 };
const surfaces = [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100, top: 0 }];
const idle = { x: 0, z: 0, facingX: 0, facingZ: -1, jump: false, crouch: false };

test('delta commands reproduce every physics state across different render frame groupings', () => {
    const attempt = createAttempt([0, 0, 0], settings, surfaces);
    const record = createRecorder(attempt);
    const live = createJumperSimulation(attempt.spawn);
    const expected = [];
    for (let frame = 0; frame < 200; frame++) {
        const angle = frame < 70 ? 0 : (frame - 70) * 0.015;
        const command = { ...idle, x: Math.sin(angle), z: -Math.cos(angle),
            facingX: Math.sin(angle), facingZ: -Math.cos(angle),
            jump: frame === 20 || frame === 150, crouch: frame >= 100 && frame < 130 };
        advanceJumper(live, frame % 2 ? 1 / 30 : 1 / 240, command, attempt.settings, attempt.surfaces, input => {
            record(input);
            expected.push(structuredClone(live.current));
        });
    }
    const replay = createReplay(JSON.parse(JSON.stringify(attempt)));
    const clock = createJumperSimulation([0, 0, 0]);
    let checked = 0;
    while (checked < expected.length) {
        advanceJumper(clock, 1 / 60, idle, settings, surfaces, () => {
            if (stepReplay(replay)) assert.deepEqual(replay.simulation.current, expected[checked++]);
        });
    }
    assert.equal(stepReplay(replay), false);
    assert.equal(replay.tick, attempt.ticks);
});

test('held inputs compress, jump releases are recorded, and substep frames record nothing', () => {
    const attempt = createAttempt([0, 0, 0], settings, surfaces);
    const record = createRecorder(attempt);
    const sim = createJumperSimulation(attempt.spawn);
    const command = { ...idle, z: -1, jump: true };
    assert.equal(advanceJumper(sim, JUMPER_STEP / 2, command, settings, surfaces, record), 0);
    assert.equal(attempt.ticks, 0);
    advanceJumper(sim, JUMPER_STEP * 2.5, command, settings, surfaces, record);
    for (let i = 0; i < 100; i++) advanceJumper(sim, JUMPER_STEP, { ...command, jump: false }, settings, surfaces, record);
    assert.equal(attempt.ticks, 103);
    assert.deepEqual(attempt.changes, [
        { tick: 0, delta: { z: -1, jump: true } },
        { tick: 1, delta: { jump: false } },
    ]);
});

test('attempts snapshot settings and nested collision geometry; replay restarts cleanly', () => {
    const geometry = [{ ...surfaces[0], orientation: { center: [0, -1, 0], halfSize: [100, 1, 100], quaternion: [0, 0, 0, 1] } }];
    const config = { ...settings };
    const attempt = createAttempt([1, 0, 2], config, geometry);
    config.speed = 99;
    geometry[0].orientation.center[1] = 50;
    assert.equal(attempt.settings.speed, 13);
    assert.equal(attempt.surfaces[0].orientation.center[1], -1);
    createRecorder(attempt)({ ...idle, x: 1 });
    const a = createReplay(attempt), b = createReplay(attempt);
    stepReplay(a);
    assert.equal(b.tick, 0);
    assert.deepEqual(b.simulation.current.position, [1, 0, 2]);
    stepReplay(b);
    assert.deepEqual(a.simulation.current, b.simulation.current);
});
