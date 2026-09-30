import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrefab } from '../../src/tools/prefabeditor/prefab.ts';
import { cameraFov, createJumperState, stepJumper, createJumperSimulation, advanceJumper, jumperRenderPosition, JUMPER_STEP } from '../app/demo/jumper/movement.ts';

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

const ratioSettings = {speed:13, jumpSpeed:9, jumpBoost:1, slideBoost:3, wallRunSpeed:13};
const flatGround = {minX:-1000,maxX:1000,minZ:-1000,maxZ:1000,top:0,bottom:-1,solid:true};
const horizontalSpeed = state => Math.hypot(...state.velocity);

test('direction changes respond quickly with progressively more drift in air and slides', () => {
    const turn = (grounded, crouched = false) => {
        let state = {...createJumperState([0,grounded ? 0 : 10,0]),grounded,crouched,velocity:[0,-13]};
        for(let i=0;i<24;i++) state=stepJumper(state,{x:1,z:0,jump:false,crouch:crouched},ratioSettings,[flatGround],1/120);
        return state.velocity;
    };
    const ground=turn(true), air=turn(false), slide=turn(true,true);
    assert.ok(ground[0]>12 && ground[1]<-0.5 && ground[1]>-3,'ground turns within 0.2s but retains drift');
    assert.ok(air[0]>10 && air[1]<ground[1],'air control keeps more momentum');
    assert.ok(slide[0]>0 && slide[1]<air[1],'slides can turn but drift widest');
    let reverse={...createJumperState([0,0,0]),grounded:true,velocity:[0,-13]};
    for(let i=0;i<24;i++) reverse=stepJumper(reverse,{x:0,z:1,jump:false},ratioSettings,[flatGround],1/120);
    assert.ok(reverse.velocity[1]>0,'opposite input reverses within 0.2s');
    assert.equal(reverse.velocity[0],0,'reversing does not introduce a sideways turn');
});

test('speed FOV grows across walking, sliding, hopping and falling, with bounded extremes', () => {
    const values=[0,13,16,27,34].map(cameraFov);
    assert.equal(values[0],75);
    assert.equal(values.at(-1),95);
    for(let i=1;i<values.length;i++) assert.ok(values[i]>values[i-1]);
    assert.equal(cameraFov(-1),75);
    assert.equal(cameraFov(100),95);
});

test('wallrun follows changed look-relative input on every wall face', () => {
    const wall={minX:0,maxX:10,minZ:0,maxZ:10,top:20,bottom:0,solid:true};
    for(const [position,normal] of [
        [[-0.3,5,5],[-1,0]], [[10.3,5,5],[1,0]],
        [[5,5,-0.3],[0,-1]], [[5,5,10.3],[0,1]],
    ]) {
        const tangent=[-normal[1],normal[0]];
        const initial={...createJumperState(position),velocity:tangent.map(v=>v*20),wallNormal:normal};
        const step=input=>stepJumper(initial,{...input,jump:false},ratioSettings,[wall],1/120);
        const along=state=>state.velocity[0]*tangent[0]+state.velocity[1]*tangent[1];
        const reversed=step({x:-tangent[0],z:-tangent[1]});
        assert.deepEqual(reversed.wallNormal,normal);
        assert.ok(along(reversed)<=-13,'opposite look-relative input reverses the wallrun');
        assert.ok(along(step({x:0,z:0}))>0,'released input retains direction');
        assert.ok(along(step({x:-normal[0]-.05*tangent[0],z:-normal[1]-.05*tangent[1]}))>0,'near-perpendicular input does not flip direction');
        assert.equal(step({x:normal[0],z:normal[1]}).wallNormal,null,'steering away releases the wall');
    }
});

test('walking, sliding and their jumps follow the 13/16/14/17 ratio', () => {
    let walk = {...createJumperState([0,0,0]), grounded:true};
    for(let i=0;i<120;i++) walk=stepJumper(walk,{x:0,z:-1,jump:false},ratioSettings,[flatGround],1/120);
    assert.equal(horizontalSpeed(walk),13);
    const hop=stepJumper(walk,{x:0,z:-1,jump:true},ratioSettings,[flatGround],1/120);
    assert.equal(horizontalSpeed(hop),14);
    let slide=stepJumper(walk,{x:0,z:-1,jump:false,crouch:true},ratioSettings,[flatGround],1/120);
    for(let i=0;i<120;i++) slide=stepJumper(slide,{x:0,z:-1,jump:false,crouch:true},ratioSettings,[flatGround],1/120);
    assert.equal(horizontalSpeed(slide),16);
    const slideHop=stepJumper(slide,{x:0,z:-1,jump:true,crouch:true},ratioSettings,[flatGround],1/120);
    assert.equal(horizontalSpeed(slideHop),17);
    let stopped=slide;
    for(let i=0;i<300;i++) stopped=stepJumper(stopped,{x:0,z:0,jump:false,crouch:true},ratioSettings,[flatGround],1/120);
    assert.equal(horizontalSpeed(stopped),0);
});

test('chained hops reach 27 and falling air steering can reach 34', () => {
    let state={...createJumperState([0,0,0]),grounded:true,velocity:[0,-13]};
    let peak=0;
    for(let i=0;i<4000;i++) {
        state=stepJumper(state,{x:0,z:-1,jump:state.grounded},ratioSettings,[flatGround],1/120);
        peak=Math.max(peak,horizontalSpeed(state));
    }
    assert.ok(Math.abs(peak-27)<1e-9);
    state={...createJumperState([0,100,0]),velocity:[27,0],velocityY:-1};
    for(let i=0;i<300;i++) {
        const speed=horizontalSpeed(state), [vx,vz]=state.velocity;
        const along=12/speed, across=Math.sqrt(1-along*along);
        state=stepJumper(state,{x:(vx*along-vz*across)/speed,z:(vz*along+vx*across)/speed,jump:false},ratioSettings,[],1/120);
    }
    assert.ok(Math.abs(horizontalSpeed(state)-34)<1e-9);
    const landed=stepJumper({...state,position:[0,0.01,0],velocityY:-10},{x:0,z:0,jump:false},ratioSettings,[flatGround],1/120);
    assert.equal(landed.grounded,true);
    assert.ok(Math.abs(horizontalSpeed(landed)-27)<1e-9);
    const wall={minX:0,maxX:1,minZ:-100,maxZ:100,top:20,bottom:0,solid:true};
    const wallHop=stepJumper({...state,position:[-0.3,5,0],velocity:[0,-34]}, {x:0,z:-1,jump:true},ratioSettings,[wall],1/120);
    assert.ok(wallHop.velocityY>0);
    assert.ok(Math.abs(horizontalSpeed(wallHop)-27)<1e-9);
});
