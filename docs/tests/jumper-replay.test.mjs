import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceJumper, createJumperSimulation, JUMPER_STEP } from '../app/demo/jumper/simulation.ts';
import { Buttons, createAttempt, packCommand, unpackCommand, Replay } from '../app/demo/jumper/replay.ts';

const settings = { speed: 13, jumpSpeed: 9, slideBoost: 3 };
const surfaces = [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100, top: 0 }];
function advance(attempt, live, packed, delta, onStep) {
    return advanceJumper(live, delta, unpackCommand(packed), attempt.settings, attempt.surfaces, command => {
        attempt.recording.append(command.jump ? packed : packed & ~Buttons.jump);
        onStep?.();
    });
}

test('binary input reproduces every physics state across buffer growth and render frame groupings', () => {
    const attempt = createAttempt([0, 0, 0], settings, surfaces);
    const live = createJumperSimulation(attempt.spawn);
    const expected = [];
    for (let frame = 0; frame < 5000; frame++) {
        // Exercise all seven button bits, opposing keys, yaw wrapping and catch-up ticks.
        const packed = packCommand(frame % 128, (frame - 1000) * 0.015);
        assert.equal(packed & 127, frame % 128);
        const decoded = unpackCommand(packed);
        const yaw = Math.atan2(-decoded.facingX, -decoded.facingZ);
        assert.equal(packCommand(packed & 127, yaw), packed);
        advance(attempt, live, packed, frame % 2 ? 1 / 30 : 1 / 240, () => expected.push(structuredClone(live.current)));
    }
    const commands = attempt.recording.finish();
    assert.equal(commands.length, expected.length);
    assert.equal(commands.byteLength, expected.length * 4);
    const replay = new Replay(attempt);
    const clock = createJumperSimulation([0, 0, 0]);
    let checked = 0;
    while (checked < expected.length) {
        advanceJumper(clock, 1 / 60, unpackCommand(0), settings, surfaces, () => {
            if (replay.step()) assert.deepEqual(replay.simulation.current, expected[checked++]);
        });
    }
    assert.equal(replay.step(), false);
    assert.equal(replay.tick, attempt.recording.ticks);
    assert.equal(attempt.recording.finish(), commands, 'playback shares the completed buffer');
});

test('each physics tick records one command, jumps last one tick, and substep frames record nothing', () => {
    const attempt = createAttempt([0, 0, 0], settings, surfaces);
    const sim = createJumperSimulation(attempt.spawn);
    const packed = packCommand(Buttons.forward | Buttons.jump, 0);
    assert.equal(advance(attempt, sim, packed, JUMPER_STEP / 2), 0);
    assert.equal(attempt.recording.ticks, 0);
    advance(attempt, sim, packed, JUMPER_STEP * 2.5);
    for (let i = 0; i < 100; i++) advance(attempt, sim, packed & ~Buttons.jump, JUMPER_STEP);
    assert.equal(attempt.recording.ticks, 103);
    const commands = attempt.recording.finish();
    assert.equal(commands.length, 103);
    assert.equal(commands[0], packed);
    assert.ok(commands.subarray(1).every(value => value === (packed & ~Buttons.jump)));
    const replay = new Replay(attempt);
    while (replay.step()) {}
    assert.deepEqual(replay.simulation.current, sim.current);
});

test('attempts snapshot settings and geometry; finished recordings support independent replay cursors', () => {
    const geometry = [{ ...surfaces[0], orientation: { center: [0, -1, 0], halfSize: [100, 1, 100], quaternion: [0, 0, 0, 1] } }];
    const config = { ...settings };
    const attempt = createAttempt([1, 0, 2], config, geometry);
    config.speed = 99;
    geometry[0].orientation.center[1] = 50;
    assert.equal(attempt.settings.speed, 13);
    assert.equal(attempt.surfaces[0].orientation.center[1], -1);
    attempt.recording.append(packCommand(Buttons.right, 0));
    const a = new Replay(attempt), b = new Replay(attempt);
    a.step();
    assert.equal(b.tick, 0);
    assert.deepEqual(b.simulation.current.position, [1, 0, 2]);
    b.step();
    assert.deepEqual(a.simulation.current, b.simulation.current);
    assert.throws(() => attempt.recording.append(0), /finished recording/);
    const empty = new Replay(createAttempt([0, 0, 0], settings, surfaces));
    assert.equal(empty.step(), false);
});

test('wall attachment, right-click release and wall jumps replay identically', () => {
    const wall = { minX: -2, maxX: -0.3, minZ: -100, maxZ: 100, bottom: -100, top: 100, solid: true };
    const attempt = createAttempt([0, 5, 0], settings, [wall]);
    const live = createJumperSimulation(attempt.spawn);
    const expected = [];
    for (let tick = 0; tick < 120; tick++) {
        const buttons = Buttons.forward | (tick % 30 === 10 ? Buttons.detach : 0)
            | (tick % 30 === 11 ? Buttons.jump : 0);
        advance(attempt, live, packCommand(buttons, Math.PI / 2), JUMPER_STEP,
            () => expected.push(structuredClone(live.current)));
    }
    assert.ok(expected.some(state => state.wallNormal));
    assert.equal(expected[10].wallNormal, null);
    assert.ok(expected[11].velocityY > expected[10].velocityY);
    const replay = new Replay(attempt);
    for (const state of expected) {
        assert.equal(replay.step(), true);
        assert.deepEqual(replay.simulation.current, state);
    }
});
