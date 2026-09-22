import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAll, createWorldSettings, addBroadphaseLayer, addObjectLayer, enableCollision,
    createWorld, updateWorld, rigidBody, box, capsule, MotionType, kcc, filter } from 'crashcat';
import { moveKinematicBody } from '../src/plugins/crashcat/kinematic.ts';

registerAll();

import { createPlatformSupport } from '../docs/app/demo/killbox/components/platformSupport.ts';

for (const fps of [20, 60, 144]) test(`lift carries the player up, down and sideways at ${fps} FPS`, () => {
    const settings = createWorldSettings();
    const layer = addObjectLayer(settings, addBroadphaseLayer(settings));
    enableCollision(settings, layer, layer);
    const world = createWorld(settings);
    const platform = rigidBody.create(world, {
        shape: box.create({ halfExtents: [1, 0.05, 1] }),
        position: [0, 0, 0], motionType: MotionType.KINEMATIC, objectLayer: layer,
    });
    const character = kcc.create({
        shape: capsule.create({ radius: 0.35, halfHeightOfCylinder: 0.45 }),
        characterPadding: 0.02,
    }, [0, 0.85, 0], [0, 0, 0, 1]);
    const query = filter.forWorld(world);
    const updateSettings = kcc.createDefaultUpdateSettings();
    const support = createPlatformSupport();
    const gravity = [0, -9.81, 0];
    kcc.refreshContacts(world, character, query);
    support.capture(world, character);
    assert.equal(support.body, platform);
    rigidBody.sleep(world, platform);
    let accumulator = 0;
    let height = 0, x = 0;
    const delta = 1 / fps;
    for (const speed of [5, 0, -17.2, 0, 5]) {
        for (let frame = 0; frame < fps; frame++) {
            height += speed * delta;
            x += delta;
            moveKinematicBody(world, platform, [x, height, 0], [0, 0, 0, 1], delta);
            const steps = Math.ceil(delta / (1 / 60));
            for (let i = 0; i < steps; i++) updateWorld(world, {}, delta / steps);
            support.carry(world, character);
            accumulator += delta;
            kcc.refreshContacts(world, character, query, support.listener);
            while (accumulator + 1e-9 >= 1 / 60) {
                support.capture(world, character);
                character.linearVelocity.fill(0);
                kcc.update(world, character, 1 / 60, gravity, updateSettings, support.listener, query);
                support.capture(world, character);
                accumulator -= 1 / 60;
            }
            assert.ok(Math.abs(platform.position[1] - height) < 1e-5, 'collider reaches visual target');
            assert.ok(Math.abs(character.position[1] - height - 0.85) < 0.05, 'player stays on lift in both directions');
            assert.ok(Math.abs(character.position[0] - x) < 0.01, 'horizontal carry');
            assert.equal(support.body, platform);
        }
    }
    // Jumping detaches: later movement must not carry the airborne player.
    character.linearVelocity[1] = 5;
    kcc.update(world, character, 1 / 60, gravity, updateSettings, support.listener, query);
    support.capture(world, character);
    assert.equal(support.body, null, 'jump releases support');
    const jumpPosition = [...character.position];
    moveKinematicBody(world, platform, [x, height + 1, 0], [0, 0, 0, 1], delta);
    updateWorld(world, {}, delta);
    support.carry(world, character);
    assert.deepEqual(character.position, jumpPosition);
    rigidBody.remove(world, platform);
});
