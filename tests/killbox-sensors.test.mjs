import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerAll, createWorldSettings, addBroadphaseLayer, addObjectLayer, enableCollision,
    createWorld, updateWorld, rigidBody, box, capsule, MotionType } from 'crashcat';

registerAll();
const prefab = JSON.parse(readFileSync(new URL('../docs/public/prefabs/killbox.json', import.meta.url)));

test('each lift has its own boarding sensor that detects the kinematic player', () => {
    const lifts = prefab.root.children.filter(node => node.components?.elevatormover);
    const eventNames = lifts.map(node => node.components.elevatormover.properties.contactEventName);
    assert.equal(new Set(eventNames).size, lifts.length);
    for (const lift of lifts) {
        const event = lift.components.elevatormover.properties.contactEventName;
        const sensor = prefab.root.children.find(node => node.components?.physics?.properties.sensorEnterEventName === event);
        assert.ok(sensor, 'activation event has an authored sensor');
        assert.equal(sensor.components.physics.properties.sensor, true);
        assert.equal(lift.components.crashcatPhysics.properties.type, 'kinematicPosition');
        assert.notEqual(lift.components.crashcatPhysics.properties.sensor, true);
        const settings = createWorldSettings();
        const moving = addObjectLayer(settings, addBroadphaseLayer(settings));
        const fixed = addObjectLayer(settings, addBroadphaseLayer(settings));
        enableCollision(settings, moving, fixed);
        const world = createWorld(settings);
        const sensorBody = rigidBody.create(world, {
            shape: box.create({ halfExtents: sensor.components.geometry.properties.args.map(size => size / 2) }),
            position: sensor.components.transform.properties.position,
            motionType: MotionType.STATIC, objectLayer: fixed, sensor: true,
        });
        const [x,y,z] = lift.components.transform.properties.position;
        const player = rigidBody.create(world, {
            shape: capsule.create({radius:0.35,halfHeightOfCylinder:0.45}),
            position:[x,y+0.85,z], motionType:MotionType.KINEMATIC, objectLayer:moving,
            collideKinematicVsNonDynamic:true,
        });
        let entered = false;
        updateWorld(world, { onContactAdded(a,b) {
            if ((a === sensorBody && b === player) || (b === sensorBody && a === player)) entered = true;
        } }, 1/60);
        assert.ok(entered, 'standing on the platform triggers its sensor');
        rigidBody.remove(world, player);
        rigidBody.remove(world, sensorBody);
    }
});
