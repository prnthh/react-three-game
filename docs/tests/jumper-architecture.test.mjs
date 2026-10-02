import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3, Euler, Matrix4, Quaternion, Vector3} from 'three';
import {normalizePrefab} from '../../src/core/prefab.ts';
import {createJumperState, stepJumper, surfaceTopAt, STANDING_HEIGHT} from '../app/demo/jumper/movement.ts';

import {resolveCollisionSurfaceSize} from '../app/demo/jumper/components/CollisionSurfaceComponent.tsx';

import {expandEmbeddedPrefabs,readTestPrefab} from './support/expand-prefabs.mjs';
const authoredScene=JSON.parse(readFileSync(new URL('../public/prefabs/jumper-course.json',import.meta.url),'utf8'));
const scene=expandEmbeddedPrefabs(authoredScene);
const surfaces=new Map();
function visit(node,parent=new Matrix4()) {
    const t=node.components?.transform?.properties??{};
    const matrix=parent.clone().multiply(new Matrix4().compose(new Vector3(...(t.position??[0,0,0])),new Quaternion().setFromEuler(new Euler(...(t.rotation??[0,0,0]))),new Vector3(...(t.scale??[1,1,1]))));
    const collision=node.components?.collision?.properties;
    if(collision){const size=node.components?.geometry?.properties?.args?.slice(0,3)??collision.size??[1,1,1];const half=new Vector3(...size).multiplyScalar(.5);const box=new Box3(half.clone().negate(),half).applyMatrix4(matrix);surfaces.set(node.id,{minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z,top:box.max.y,bottom:box.min.y,solid:collision.solid,...(node.id.startsWith('spiral-connecting-beam-')?{orientation:{center:new Vector3().setFromMatrixPosition(matrix).toArray(),halfSize:new Vector3(...size).multiplyScalar(.5).multiply(new Vector3().setFromMatrixScale(matrix)).toArray(),quaternion:new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix)).toArray()}}:{})});}
    node.children?.forEach(child=>visit(child,matrix));
}
visit(scene.root);
const center=s=>[(s.minX+s.maxX)/2,s.top,(s.minZ+s.maxZ)/2];
const settings={speed:13,jumpSpeed:9,jumpBoost:1};

test('jumper prefab definitions are self-contained, including nested references',()=>{
    const seen=new Set();
    function inspect(value) {
        if(!value||typeof value!=='object')return;
        if(value.type==='PrefabRef') {
            const url=value.properties?.url;
            assert.match(url??'',/^data:application\/json;charset=utf-8,/, 'prefabs must be saved inside the jumper scene');
            if(!seen.has(url)) {seen.add(url);inspect(readTestPrefab(url));}
        }
        Object.values(value).forEach(inspect);
    }
    inspect(authoredScene);
});

test('the expanded entry canyon supports full-speed jumps into its broad landings',()=>{
    checkRunningJump('entry-slab','broken-landing');
    checkRunningJump('broken-landing','deep-landing');
});

test('the sparse long-jump court connects outdoor roofs, the covered hall and the spiral',()=>{
    checkJump('playground-ground','ruin-ext-low-0',[52,-1.5,-7]);
    const route=[0,1,2,3,4,5,6,10].map(i=>`ruin-ext-low-${i}`);
    for(let i=1;i<route.length;i++)checkRunningJump(route[i-1],route[i]);
    checkJump('ruin-ext-low-10','ruin-ext-entry-0');
    checkJump('ruin-ext-entry-0','ruin-ext-entry-1');
    checkJump('ruin-ext-entry-1','ruin-ext-entry-2');
    checkJump('ruin-ext-entry-2','ruin-step-3');
});
test('spiral climb uses fewer landings and walkable angled floor connections',()=>{
    for(const [from,to] of [['ruin-approach-2','construction-deck-1-n'],['ruin-step-6','construction-deck-2-s'],['construction-deck-2-w','ruin-step-9'],['construction-deck-3-e','ruin-step-17']])checkLandingJump(from,to);
    const connections=[[[38,10.6,-48],[30.2,14.95,-41.55]],[[29.6,14.85,-41.2],[34.8,19.4,-41.2]],[[35,22.65,-47],[30.65,25.4,-41.5]],[[29.7,25.25,-40.8],[33.7,28,-46.6]],[[40,27.85,-48],[40,31.55,-43.1]],[[35.2,33.05,-50.5],[30.4,37.1,-50.5]],[[28,36.95,-47],[31.9,41.95,-38.5]]];
    for(const [i,[a,b]] of connections.entries()){
        const beam=resolveSurface(`spiral-connecting-beam-${i}`);
        const distance=Math.hypot(b[0]-a[0],b[2]-a[2]),dx=(b[0]-a[0])/distance,dz=(b[2]-a[2])/distance;
        let state={...createJumperState([a[0],surfaceTopAt(beam,a[0],a[2]),a[2]]),grounded:true};
        for(let f=0;f<Math.ceil(distance/3*120);f++)state=stepJumper(state,{x:dx,z:dz,jump:false},{...settings,speed:3},[...surfaces.values()],1/120);
        assert.ok(Math.hypot(state.position[0]-b[0],state.position[2]-b[2])<.7,`beam ${i}: stopped at ${state.position}`);
        assert.ok(state.position[1]>b[1]-.3,`beam ${i}: did not climb to the upper floor: ${state.position}`);
    }
});
test('middle ramp has a walkable approach, standing clearance and landing exit',()=>{
    const lower=resolveSurface('ruin-step-3'),upper=resolveSurface('ruin-step-6');
    let state={...createJumperState([28.8,lower.top,-41.2]),grounded:true};
    for(let frame=0;frame<300;frame++){
        state=stepJumper(state,{x:1,z:0,jump:false},{...settings,speed:3},[...surfaces.values()],1/120);
        const [x,y,z]=state.position;
        for(const [id,s] of surfaces){
            if(!s.solid||s.orientation)continue;
            const intersects=x+.3>s.minX&&x-.3<s.maxX&&z+.3>s.minZ&&z-.3<s.maxZ
                &&y<s.top-.01&&y+STANDING_HEIGHT>s.bottom+.01;
            assert.ok(!intersects,`ramp traversal intersects ${id} at ${state.position}`);
        }
    }
    assert.ok(state.position[0]>upper.minX+.6,'walk off the ramp onto the upper landing');
    assert.ok(state.grounded,'finish standing on the upper landing');
    assert.ok(Math.abs(state.position[1]-upper.top)<.01,`expected upper landing, got ${state.position}`);
});
function resolveSurface(id){
    if(surfaces.has(id))return surfaces.get(id);
    const matches=[...surfaces].filter(([key])=>key.endsWith('/'+id));
    assert.equal(matches.length,1,`${id}: unique surface required`);
    return matches[0][1];
}
test('construction decks do not obstruct spiral landings with low ceilings',()=>{
    const landings=[...surfaces].filter(([id])=>/construction-deck-\d-[nesw]$|\/ruin-step-\d+$/.test(id));
    for(const [lowerId,lower] of landings)for(const [upperId,upper] of landings){
        if(upper.top<=lower.top)continue;
        const overlapX=Math.min(lower.maxX,upper.maxX)-Math.max(lower.minX,upper.minX);
        const overlapZ=Math.min(lower.maxZ,upper.maxZ)-Math.max(lower.minZ,upper.minZ);
        if(overlapX>0&&overlapZ>0)assert.ok(upper.bottom-lower.top>=STANDING_HEIGHT,
            `${upperId} obstructs ${lowerId}: ${upper.bottom-lower.top} headroom`);
    }
});
function checkRunningJump(fromId,toId){
    const from=resolveSurface(fromId),to=resolveSurface(toId);
    const a=center(from),b=center(to),distance=Math.hypot(b[0]-a[0],b[2]-a[2]);
    const dx=(b[0]-a[0])/distance,dz=(b[2]-a[2])/distance;
    const edge=Math.min(Math.abs(dx)>1e-6?((from.maxX-from.minX)/2-.5)/Math.abs(dx):Infinity,
        Math.abs(dz)>1e-6?((from.maxZ-from.minZ)/2-.5)/Math.abs(dz):Infinity);
    const start=[a[0]+dx*edge,a[1],a[2]+dz*edge];
    let state={...createJumperState(start),grounded:true,velocity:[13*dx,13*dz]};
    for(let frame=0;frame<240;frame++){
        state=stepJumper(state,{x:dx,z:dz,jump:frame===0},settings,[...surfaces.values()],1/120);
        if(frame>0&&state.grounded)break;
    }
    assert.ok(state.grounded,`${fromId} → ${toId}: no landing`);
    assert.ok(Math.abs(state.position[1]-to.top)<1e-5,`${fromId} → ${toId}: landed at ${state.position[1]}, expected ${to.top}`);
    assert.ok(state.position[0]>to.minX+.1&&state.position[0]<to.maxX-.1&&state.position[2]>to.minZ+.1&&state.position[2]<to.maxZ-.1,`${fromId} → ${toId}: insufficient landing margin`);
}
test('ruin extension sky viaduct connects the spiral to the crown climb',()=>{
    checkJump('ruin-step-13','ruin-ext-traverse-0');
    for(let i=1;i<5;i++)checkJump(`ruin-ext-traverse-${i-1}`,`ruin-ext-traverse-${i}`);
    checkLandingJump('ruin-ext-traverse-4','ruin-ext-tower-step-0');
    for(let i=1;i<11;i++)checkLandingJump(`ruin-ext-tower-step-${i-1}`,`ruin-ext-tower-step-${i}`);
    checkLandingJump('ruin-ext-tower-step-10','ruin-ext-tower-summit');
});
test('ruin extension precision return reaches the solid original roof',()=>{
    checkLandingJump('ruin-ext-tower-step-8','ruin-ext-return-0');
    for(let i=1;i<5;i++)checkJump(`ruin-ext-return-${i-1}`,`ruin-ext-return-${i}`);
    checkJump('ruin-ext-return-4','construction-deck-4-w');
});
test('west reservoir traverse extends the portico roof into the empty quadrant',()=>{
    checkJump('west-portico-roof','west-annex-step-0',[-27,16.35,-27]);
    for(let i=1;i<11;i++)checkJump(`west-annex-step-${i-1}`,`west-annex-step-${i}`);
});
test('west spillway climb clears the reservoir walls and reaches the observation spine',()=>{
    checkJump('west-annex-step-10','west-spillway-step-0');
    for(let i=1;i<8;i++)checkJump(`west-spillway-step-${i-1}`,`west-spillway-step-${i}`);
    checkJump('west-spillway-step-7','west-spillway-crown',undefined,[-72,41.05,-49]);
});

// Broad terraces allow takeoff and landing away from their centers. Require a
// collision-free fixed-step jump with a 0.6 m inset at both ends, at normal speed.
function checkLandingJump(fromId,toId){
    const points=s=>[.0,.25,.5,.75,1].flatMap(u=>[.0,.25,.5,.75,1].map(v=>[
        s.minX+.6+u*(s.maxX-s.minX-1.2),s.top,s.minZ+.6+v*(s.maxZ-s.minZ-1.2)]));
    const starts=points(resolveSurface(fromId)),ends=points(resolveSurface(toId));
    let lastError;
    for(const start of starts)for(const end of ends){
        try {checkJump(fromId,toId,start,end);return;} catch(error){lastError=error;}
    }
    assert.fail(`${fromId} → ${toId}: no clear jump between inset landing points; ${lastError?.message}`);
}

function checkJump(fromId,toId,fromPosition,toPosition){
    const resolve=id=>{
        if(surfaces.has(id))return surfaces.get(id);
        const matches=[...surfaces].filter(([key])=>key.endsWith('/'+id));
        assert.ok(matches.length<=1,`${id}: ambiguous unpacked surface`);
        return matches[0]?.[1];
    };
    const from=resolve(fromId),to=resolve(toId);
    assert.ok(from&&to,`${fromId} → ${toId}: missing collision`);
    const start=fromPosition??center(from),end=toPosition??center(to);
    for(const [id,s] of surfaces) {
        const intersects = s.solid && start[0]+.3>s.minX && start[0]-.3<s.maxX
            && start[2]+.3>s.minZ && start[2]-.3<s.maxZ
            && start[1]<s.top-.001 && start[1]+1.8>s.bottom+.001;
        assert.ok(!intersects, `${fromId}: takeoff intersects ${id}`);
    }
    const dt=1/120;
    // Find the descending crossing of the target height under the actual fixed-step gravity.
    let y=start[1],vy=9,time=0;
    do{vy-=20*dt;y+=vy*dt;time+=dt;}while((vy>0||y>end[1])&&time<2);
    assert.ok(time<2,`${toId}: unreachable height`);
    const vx=(end[0]-start[0])/time,vz=(end[2]-start[2])/time;
    assert.ok(Math.hypot(vx,vz)<=14,`${fromId} → ${toId}: needs ${Math.hypot(vx,vz).toFixed(2)} speed`);
    let state={...createJumperState(start),velocity:[vx,vz],velocityY:9};
    for(let i=0;i<240&&!state.grounded;i++)state=stepJumper(state,{x:0,z:0,jump:false},settings,[...surfaces.values()],dt);
    assert.equal(state.grounded,true,`${toId}: no landing`);
    assert.ok(Math.abs(state.position[1]-to.top)<1e-6,`${fromId} → ${toId}: landed at height ${state.position[1]} instead of ${to.top}`);
    assert.ok(state.position[0]>to.minX&&state.position[0]<to.maxX&&state.position[2]>to.minZ&&state.position[2]<to.maxZ,`${toId}: landing missed the top`);
}

test('architectural sections have unique IDs and collision surfaces with valid primitive dimensions',()=>{
    normalizePrefab(scene);
    const ids=new Set();
    function check(n){assert.ok(!ids.has(n.id),n.id);ids.add(n.id);if(n.components?.collision&&n.components.geometry?.type==='Geometry'){assert.equal(n.components.collision.type,'CollisionSurface');assert.ok((n.components.geometry.properties.args??[1,1,1]).slice(0,3).every(v=>Number.isFinite(v)&&v>0));}n.children?.forEach(check);}
    scene.root.children.filter(n=>n.id.startsWith('motif-')).forEach(check);
});
test('courtyard terraces lead onto the overhead bridge',()=>{
    checkJump('court-floor','court-step-1',[-5,0,-37]);
    for(let i=1;i<5;i++)checkJump(`court-step-${i}`,`court-step-${i+1}`);
    checkJump('court-step-5','court-skybridge',undefined,[6,7,-52]);
});
test('the bridge and narrow passage form a reachable ledge route',()=>{
    checkJump('court-skybridge','passage-pier-1',[2,7,-53.1]);
    for(let i=1;i<4;i++)checkJump(`passage-pier-${i}`,`passage-pier-${i+1}`);
});
test('the passage connects to every roof and the final terrace',()=>{
    checkJump('passage-pier-4','roof-pier-1');
    for(let i=1;i<4;i++)checkJump(`roof-pier-${i}`,`roof-pier-${i+1}`);
    checkJump('roof-pier-4','roof-terrace');
});
test('the original course has a walkable doorway into the courtyard',()=>{
    let state={...createJumperState([-1.1,0,-32]),grounded:true,velocity:[0,-4]};
    for(let i=0;i<180;i++)state=stepJumper(state,{x:0,z:-1,jump:false},{speed:4,jumpSpeed:9},[...surfaces.values()],1/120);
    assert.ok(state.position[2]<-37,'walk through the gateway without hitting its lintel');
    assert.equal(state.position[1],0);
});
test('the west portico turns back and climbs onto the original canyon',()=>{
    const route=['court-step-2','court-west-threshold','west-entry','west-turn-1','west-turn-2','west-turn-3','west-turn-4','west-turn-5','west-rise-1','west-rise-2','west-rise-3','west-rise-4','west-return'];
    for(let i=1;i<route.length;i++)checkJump(route[i-1],route[i]);
    checkJump('west-return','left-mass',undefined,[-5.75,16,5]);
});
test('the sky arcade loops around the tower and descends onto the passage',()=>{
    checkJump('roof-terrace','east-launch',[4,18.2,-116]);
    const route=['east-launch','east-turn-1','east-turn-2','east-rise-1','east-rise-2','east-turn-3','east-crossing','east-return','east-descent','passage-header'];
    for(let i=1;i<route.length;i++)checkJump(route[i-1],route[i]);
});

test('collision dimensions come from the primitive independently of weathering',()=>{
    const node={id:'piece',components:{
        shape:{type:'Geometry',properties:{geometryType:'box',args:[2,6,4,3,8,3]}},
        damage:{type:'WeatheredGeometry',properties:{amount:.4,seed:3}},
    }};
    assert.deepEqual(resolveCollisionSurfaceSize(node,[1,1,1]),[2,6,4]);
    delete node.components.damage;
    assert.deepEqual(resolveCollisionSurfaceSize(node,[1,1,1]),[2,6,4]);
    node.components.shape.properties.geometryType='cylinder';
    assert.deepEqual(resolveCollisionSurfaceSize(node,[3,7,3]),[3,7,3]);
});
