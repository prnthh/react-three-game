import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry, Box3, Euler, Matrix4, Quaternion, Vector3} from 'three';
import {normalizePrefab} from '../../src/tools/prefabeditor/prefab.ts';
import {createJumperState, stepJumper} from '../app/demo/jumper/movement.ts';

import {roughenGeometry} from '../app/demo/jumper/components/RuinGeometryComponent.tsx';

const scene=JSON.parse(readFileSync(new URL('../public/prefabs/jumper-course.json',import.meta.url),'utf8'));
const surfaces=new Map();
function visit(node,parent=new Matrix4()) {
    const t=node.components?.transform?.properties??{};
    const matrix=parent.clone().multiply(new Matrix4().compose(new Vector3(...(t.position??[0,0,0])),new Quaternion().setFromEuler(new Euler(...(t.rotation??[0,0,0]))),new Vector3(...(t.scale??[1,1,1]))));
    const collision=node.components?.collision?.properties;
    if(collision){const half=new Vector3(...collision.size).multiplyScalar(.5);const box=new Box3(half.clone().negate(),half).applyMatrix4(matrix);surfaces.set(node.id,{minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z,top:box.max.y,bottom:box.min.y,solid:collision.solid});}
    node.children?.forEach(child=>visit(child,matrix));
}
visit(scene.root);
const center=s=>[(s.minX+s.maxX)/2,s.top,(s.minZ+s.maxZ)/2];
const settings={speed:13,jumpSpeed:9,jumpBoost:1};

function checkJump(fromId,toId,fromPosition,toPosition){
    const from=surfaces.get(fromId),to=surfaces.get(toId);
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

test('architectural sections have unique IDs and matching axis-aligned render/collision boxes',()=>{
    normalizePrefab(scene);
    const ids=new Set();
    function check(n){assert.ok(!ids.has(n.id),n.id);ids.add(n.id);if(n.components?.collision){assert.deepEqual(n.components.collision.properties.size,[1,1,1]);assert.deepEqual(n.components.geometry?.properties.args??[1,1,1],[1,1,1]);assert.ok(!(n.components.transform.properties.rotation??[]).some(Boolean));}n.children?.forEach(check);}
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
    checkJump('west-return','left-mass',undefined,[-2.3,16,5]);
});
test('the sky arcade loops around the tower and descends onto the passage',()=>{
    checkJump('roof-terrace','east-launch',[4,18.2,-116]);
    const route=['east-launch','east-turn-1','east-turn-2','east-rise-1','east-rise-2','east-turn-3','east-crossing','east-return','east-descent','passage-header'];
    for(let i=1;i<route.length;i++)checkJump(route[i-1],route[i]);
});

test('the courtyard doorway leads through every turn of the vertical ruin',()=>{
    let state={...createJumperState([7,7,-52]),grounded:true,velocity:[4,0]};
    for(let i=0;i<100;i++)state=stepJumper(state,{x:1,z:0,jump:false},{speed:4,jumpSpeed:9},[...surfaces.values()],1/120);
    assert.ok(state.position[0]>10,'walk out through the east doorway');
    assert.equal(state.position[1],7);
    checkJump('court-east-threshold','ruin-approach-1');
    checkJump('ruin-approach-1','ruin-approach-2');
    checkJump('ruin-approach-2','ruin-step-0');
    for(let i=0;i<23;i++)checkJump(`ruin-step-${i}`,`ruin-step-${i+1}`);
});
test('the ruin uses procedural primitives and tunable concrete materials',()=>{
    const ruin=scene.root.children.find(n=>n.id==='motif-vertical-ruin');
    const nodes=[];
    const collect=n=>{nodes.push(n);n.children?.forEach(collect);};collect(ruin);
    assert.ok(nodes.every(n=>!n.components?.model));
    const pieces=nodes.filter(n=>n.components?.geometry?.type==='JumperRuinGeometry');
    assert.ok(pieces.length>0);
    assert.ok(pieces.every(n=>n.components.mesh&&n.components.concrete?.type==='JumperConcrete'));
    assert.ok(new Set(pieces.map(n=>n.components.concrete.properties.weathering)).size>1);
    assert.ok(pieces.every(n=>!('asset' in n.components.geometry.properties)));
});

test('ruin displacement is repeatable, bounded and keeps seams closed without changing its source',()=>{
    const source=new BoxGeometry(2,2,2,3,3,3).toNonIndexed();
    const original=source.attributes.position.array.slice();
    const result=roughenGeometry(source,.1,17);
    assert.deepEqual(result.attributes.position.array,roughenGeometry(source,.1,17).attributes.position.array);
    assert.notDeepEqual(result.attributes.position.array,roughenGeometry(source,.1,18).attributes.position.array);
    assert.deepEqual(source.attributes.position.array,original);
    const seams=new Map();
    for(let i=0;i<original.length;i+=3){
        const key=Array.from(original.slice(i,i+3)).join(',');
        const displaced=Array.from(result.attributes.position.array.slice(i,i+3));
        if(seams.has(key))assert.deepEqual(displaced,seams.get(key));
        seams.set(key,displaced);
        displaced.forEach((v,j)=>assert.ok(Math.abs(v-original[i+j])<=.100001));
    }
    assert.ok(result.attributes.normal.array.every(Number.isFinite));
    const landing=roughenGeometry(source,.1,17,true).attributes.position.array;
    for(let i=0;i<original.length;i+=3)if(original[i+1]===1)assert.deepEqual(landing.slice(i,i+3),original.slice(i,i+3));
});
