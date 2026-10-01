import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry, Box3, Euler, Matrix4, Quaternion, Vector3} from 'three';
import {normalizePrefab} from '../../src/core/prefab.ts';
import {createJumperState, stepJumper} from '../app/demo/jumper/movement.ts';

import {resolveCollisionSurfaceSize} from '../app/demo/jumper/components/CollisionSurfaceComponent.tsx';
import {roughenGeometry} from '../../src/runtime/components/WeatheredGeometryComponent.ts';

import {expandEmbeddedPrefabs,readTestPrefab} from './support/expand-prefabs.mjs';
const authoredScene=JSON.parse(readFileSync(new URL('../public/prefabs/jumper-course.json',import.meta.url),'utf8'));
const scene=expandEmbeddedPrefabs(authoredScene);
const surfaces=new Map();
function visit(node,parent=new Matrix4()) {
    const t=node.components?.transform?.properties??{};
    const matrix=parent.clone().multiply(new Matrix4().compose(new Vector3(...(t.position??[0,0,0])),new Quaternion().setFromEuler(new Euler(...(t.rotation??[0,0,0]))),new Vector3(...(t.scale??[1,1,1]))));
    const collision=node.components?.collision?.properties;
    if(collision){const size=node.components?.geometry?.properties?.args?.slice(0,3)??collision.size??[1,1,1];const half=new Vector3(...size).multiplyScalar(.5);const box=new Box3(half.clone().negate(),half).applyMatrix4(matrix);surfaces.set(node.id,{minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z,top:box.max.y,bottom:box.min.y,solid:collision.solid});}
    node.children?.forEach(child=>visit(child,matrix));
}
visit(scene.root);
const center=s=>[(s.minX+s.maxX)/2,s.top,(s.minZ+s.maxZ)/2];
const settings={speed:13,jumpSpeed:9,jumpBoost:1};

test('west reservoir chambers meet the raft and preserve supported landing heights',()=>{
    const raft=resolveSurface('west-annex-foundation');
    for(let i=0;i<11;i++){
        const core=resolveSurface(`west-reservoir-core-${i}`);
        const cap=resolveSurface(`west-annex-step-${i}`);
        assert.ok(Math.abs(core.bottom-raft.top)<1e-6,`chamber ${i} meets raft`);
        assert.ok(Math.abs(core.top-cap.bottom)<1e-6,`chamber ${i} supports cap`);

    }

});

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
function resolveSurface(id){
    if(surfaces.has(id))return surfaces.get(id);
    const matches=[...surfaces].filter(([key])=>key.endsWith('/'+id));
    assert.equal(matches.length,1,`${id}: unique surface required`);
    return matches[0][1];
}
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
    checkJump('ruin-ext-traverse-4','ruin-ext-tower-step-0');
    for(let i=1;i<17;i++)checkJump(`ruin-ext-tower-step-${i-1}`,`ruin-ext-tower-step-${i}`);
    checkJump('ruin-ext-tower-step-16','ruin-ext-tower-summit');
});
test('ruin extension precision return reaches the solid original roof',()=>{
    checkJump('ruin-ext-tower-step-8','ruin-ext-return-0');
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

test('backfield prefab placements keep their bases grounded',()=>{
    const backfield=scene.root.children.find(n=>n.id==='motif-backfield');
    assert.ok(backfield,'missing sparse backfield');
    const samples=backfield.children.filter(n=>/^back-(signal|shrine|wall|canopy)-0[1-3]$/.test(n.id));
    assert.ok(samples.length>0,'backfield has grounded samples');
    const groundTop=surfaces.get('playground-ground').top;
    const baseNames={signal:'base',shrine:'base',wall:'foot',canopy:'foot'};
    for(const sample of samples){
        const [,kind,instance]=sample.id.match(/^back-(signal|shrine|wall|canopy)-(\d+)$/);
        const sourceId=`back-${kind}-${baseNames[kind]}`;
        const baseId=instance==='01'?sourceId:`${sample.id}/${sourceId}`;
        const base=surfaces.get(baseId);
        assert.ok(base,`${sample.id}: missing grounded base`);
        assert.ok(Math.abs(base.bottom-groundTop)<1e-6,`${sample.id}: base floats ${(base.bottom-groundTop).toFixed(3)} m above ground`);
    }
});

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




test('all window recess panels clear the roughened tower face',()=>{
    const bounds=new Map();
    function walk(n,parent=new Matrix4()){
        const cs=Object.values(n.components??{});
        const t=cs.find(c=>c.type==='Transform')?.properties??{};
        const world=parent.clone().multiply(new Matrix4().compose(new Vector3(...(t.position??[0,0,0])),new Quaternion().setFromEuler(new Euler(...(t.rotation??[0,0,0]))),new Vector3(...(t.scale??[1,1,1]))));
        if(n.id==='window-tower'||n.id.endsWith('window-dark-0')){
            const g=cs.find(c=>c.type==='Geometry').properties;
            const w=cs.find(c=>c.type==='WeatheredGeometry').properties;
            const source=new BoxGeometry(...g.args);
            const rough=roughenGeometry(source,w.amount,w.seed,w.preserveTop,w.preserveBottom,w.displacementScale);
            rough.computeBoundingBox();bounds.set(n.id,rough.boundingBox.clone().applyMatrix4(world));
            source.dispose();rough.dispose();
        }
        n.children?.forEach(c=>walk(c,world));
    }
    walk(scene.root);
    const tower=bounds.get('window-tower');
    const windows=[...bounds].filter(([id])=>id!=='window-tower');
    assert.ok(windows.length>0,'window recesses are present');
    for(const[id,box]of windows)assert.ok(box.min.z>tower.max.z+.01,`${id}: panel is swallowed by weathered concrete`);
});
