import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAll, createWorldSettings, addBroadphaseLayer, addObjectLayer, enableCollision,
    createWorld, rigidBody, MotionType, box, capsule, kcc, filter, updateWorld } from 'crashcat';
import { SimplePlayerComponent } from '../app/demo/coolstuff/components/SimplePlayerComponent.tsx';

test('the simple player can push a sleeping warehouse-weight box', () => {
    registerAll();
    const settings = createWorldSettings();
    const moving = addObjectLayer(settings, addBroadphaseLayer(settings));
    const fixed = addObjectLayer(settings, addBroadphaseLayer(settings));
    enableCollision(settings, moving, moving);
    enableCollision(settings, moving, fixed);
    const world = createWorld(settings);
    rigidBody.create(world, { shape: box.create({ halfExtents: [10, 0.5, 10] }),
        motionType: MotionType.STATIC, objectLayer: fixed, position: [0, -0.5, 0] });
    const carton = rigidBody.create(world, { shape: box.create({ halfExtents: [0.25, 0.4, 0.3] }),
        motionType: MotionType.DYNAMIC, objectLayer: moving, position: [0, 0.4, -1], friction: 0.8 });
    rigidBody.sleep(world, carton);
    assert.equal(carton.sleeping, true);
    const shape = capsule.create({ radius: 0.35, halfHeightOfCylinder: 0.55 });
    const character = kcc.create({ shape, maxStrength: SimplePlayerComponent.properties.pushForce.default,
        innerRigidBody: { shape, objectLayer: moving } }, [0, 0.92, 0], [0, 0, 0, 1]);
    kcc.add(world, character);
    const query = filter.forWorld(world);
    const update = kcc.createDefaultUpdateSettings();
    let woke = false;
    for (let i = 0; i < 120; i++) {
        updateWorld(world, {}, 1 / 60);
        kcc.refreshContacts(world, character, query);
        character.linearVelocity[0] = 0;
        character.linearVelocity[2] = -SimplePlayerComponent.properties.speed.default;
        character.linearVelocity[1] = kcc.isSupported(character) ? 0 : character.linearVelocity[1] - 9.81 / 60;
        kcc.update(world, character, 1 / 60, [0, -9.81, 0], update, undefined, query);
        woke ||= !carton.sleeping;
    }
    assert.ok(woke, 'contact wakes the box');
    assert.ok(carton.position[2] < -1.5, `box moved forward: ${carton.position[2]}`);
    kcc.remove(world, character);
});
