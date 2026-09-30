import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrefab } from '../../src/tools/prefabeditor/prefab.ts';
import { createJumperState, stepJumper } from '../app/demo/jumper/movement.ts';

test('jumper landing blocks its front and catches a falling player', () => {
    const prefab = JSON.parse(readFileSync(new URL('../public/prefabs/jumper-course.json', import.meta.url)));
    const node = normalizePrefab(prefab).nodesById['broken-landing'];
    const [x, y, z] = node.components.transform.properties.position;
    const [w, h, d] = node.components.collision.properties.size.map((v, i) => v * (node.components.transform.properties.scale?.[i] ?? 1));
    const surface = { minX: x-w/2, maxX: x+w/2, minZ: z-d/2, maxZ: z+d/2,
        top: y+h/2, bottom: y-h/2, solid: node.components.collision.properties.solid };
    let state = createJumperState([0, -0.6, surface.maxZ + 0.4]);
    state.velocity = [0, -15];
    state = stepJumper(state, {x:0,z:-1,jump:false}, {speed:5,jumpSpeed:9}, [surface], 1/120);
    assert.ok(state.position[2] >= surface.maxZ + 0.3 - 1e-6);
    state = createJumperState([0, 2, z]);
    for(let i=0;i<180;i++) state = stepJumper(state, {x:0,z:0,jump:false}, {speed:5,jumpSpeed:9}, [surface], 1/120);
    assert.equal(state.position[1], 0);
    assert.equal(state.grounded, true);
});

test('idle jumps stay vertical while moving jumps retain a boost', () => {
    const idle = createJumperState([0, 0, 0]); idle.grounded = true;
    const settings = {speed:5, jumpSpeed:9, jumpBoost:2};
    const vertical = stepJumper(idle, {x:0,z:0,jump:true}, settings, [], 1/120);
    assert.deepEqual(vertical.velocity, [0, 0]);
    assert.equal(vertical.position[0], 0);
    assert.equal(vertical.position[2], 0);
    assert.ok(vertical.velocityY > 0);
    const moving = {...idle, velocity: [0, -5]};
    const boosted = stepJumper(moving, {x:0,z:-1,jump:true}, settings, [], 1/120);
    assert.ok(boosted.velocity[1] < -5);
    const sideways = stepJumper(idle, {x:1,z:0,jump:true}, settings, [], 1/120);
    assert.ok(sideways.velocity[0] > 2);
    assert.equal(sideways.velocity[1], 0);
});

test('wide ground catches a fall through the gap and outside the walls', () => {
    const prefab = JSON.parse(readFileSync(new URL('../public/prefabs/jumper-course.json', import.meta.url)));
    const ground = normalizePrefab(prefab).nodesById['playground-ground'];
    const [x,y,z] = ground.components.transform.properties.position;
    const [w,h,d] = ground.components.collision.properties.size.map((v, i) => v * (ground.components.transform.properties.scale?.[i] ?? 1));
    const surface = {minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top:y+h/2,bottom:y-h/2,solid:true};
    for (const position of [[0, 0, -7], [20, 5, 10]]) {
        let state = createJumperState(position);
        for (let i=0;i<240;i++) state = stepJumper(state,{x:0,z:0,jump:false},{speed:5,jumpSpeed:9},[surface],1/120);
        assert.equal(state.position[1], -1.5);
        assert.equal(state.grounded, true);
    }
});

const { createJumperSimulation, advanceJumper, jumperRenderPosition, JUMPER_STEP } = await import('../app/demo/jumper/timestep.ts');

test('flat-ground rendering moves uniformly across variable frame intervals', () => {
    const ground = {minX:-100,maxX:100,minZ:-100,maxZ:100,top:0,bottom:-1,solid:true};
    for (const intervals of [[1/60], [1/144], [0.004,0.019,0.007,0.012]]) {
        const sim = createJumperSimulation([0,0,0]);
        sim.current.grounded = true; sim.current.velocity = [0,-5];
        let time = 0;
        for (let i=0;i<200;i++) {
            const dt = intervals[i % intervals.length]; time += dt;
            advanceJumper(sim,dt,{x:0,z:-1,jump:false},{speed:5,jumpSpeed:9},[ground]);
            if (time >= JUMPER_STEP) assert.ok(Math.abs(jumperRenderPosition(sim)[2] + 5*(time-JUMPER_STEP)) < 1e-9);
            assert.equal(sim.current.grounded,true);
        }
    }
});

test('fixed-step catch-up consumes a jump once and bounds suspended frames', () => {
    const sim = createJumperSimulation([0,0,0]); sim.current.grounded = true;
    assert.equal(advanceJumper(sim,10,{x:0,z:0,jump:true},{speed:5,jumpSpeed:9},[]),12);
    assert.ok(sim.current.velocityY > 6 && sim.current.velocityY < 8);
    assert.ok(sim.remainder < JUMPER_STEP);
    assert.equal(advanceJumper(sim,0.001,{x:0,z:0,jump:true},{speed:5,jumpSpeed:9},[]),0);
});
