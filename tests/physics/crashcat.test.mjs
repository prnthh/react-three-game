import { createColliderResidencyScheduler } from '../../src/plugins/crashcat/colliderResidency.ts';
import { terrainPhysicsProblem } from '../../src/plugins/crashcat/TerrainPhysicsComponent.tsx';
import { registerAll, createWorldSettings, addBroadphaseLayer, addObjectLayer, enableCollision, createWorld, rigidBody, MotionType, triangleMesh, capsule, kcc, filter } from 'crashcat';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { getPhysicsScene } from '../../src/plugins/crashcat/physicsScene.ts';
import { createShapeForObject } from '../../src/plugins/crashcat/collisionShapes.ts';
import { decomposeModelToPrefabNodes } from '../../src/editor/modelPrefab.ts';
import { importCollisionModel } from '../../src/plugins/crashcat/importCollisionModel.ts';

describe('Scene ownership', () => {
    test('physics ownership is isolated per Three.js scene and releases on unmount', () => {
        const scene = new Scene();
        const first = getPhysicsScene(scene);
        const second = getPhysicsScene(new Scene());
        assert.equal(getPhysicsScene(scene), first);
        const updates = [];
        const unsubscribe = first.subscribe(() => updates.push(first.getSnapshot()));
        const a = {world:'a'}, b = {world:'b'};
        const releaseA = first.register(a);
        const releaseB = second.register(b);
        assert.equal(first.getSnapshot(), a);
        assert.equal(second.getSnapshot(), b);
        assert.throws(() => first.register(b), /Only one CrashcatRuntime/);
        releaseA();
        assert.equal(first.getSnapshot(), null);
        assert.equal(second.getSnapshot(), b);
        const releaseReplacement = first.register(b);
        releaseA();
        assert.equal(first.getSnapshot(), b, 'old cleanup cannot clear its replacement');
        releaseReplacement();
        assert.deepEqual(updates, [a, null, b, null]);
        unsubscribe();
        releaseB();
    });
});

describe('Collision shapes', () => {
    registerAll();

    test('shared geometry produces colliders using each node’s current transforms', () => {
        const geometry = new BoxGeometry(2, 2, 2);
        const a = new Group(), b = new Group();
        const first = new Mesh(geometry), second = new Mesh(geometry);
        a.add(first); b.add(second);
        first.scale.set(2, 1, 1);
        second.scale.set(4, 1, 1);
        assert.equal(createShapeForObject(a, {colliders:'cuboid'}).halfExtents[0], 2);
        assert.equal(createShapeForObject(b, {colliders:'cuboid'}).halfExtents[0], 4);
        first.scale.x = 3;
        assert.equal(createShapeForObject(a, {colliders:'cuboid'}).halfExtents[0], 3);
        geometry.dispose();
    });

    test('offset meshes keep their collider center', () => {
        const node = new Group();
        const mesh = new Mesh(new BoxGeometry(2, 2, 2));
        mesh.position.set(3, 2, 1);
        node.add(mesh);
        const shape = createShapeForObject(node, {colliders:'cuboid'});
        assert.deepEqual(shape.position, [3, 2, 1]);
        assert.deepEqual(shape.shape.halfExtents, [1, 1, 1]);
        mesh.geometry.dispose();
    });

    for (const colliders of ['hull', 'trimesh']) test(`${colliders} respects node scale`, () => {
        const mesh = new Mesh(new BoxGeometry(2, 2, 2));
        mesh.scale.set(2, 3, 4);
        const shape = createShapeForObject(mesh, {colliders});
        assert.deepEqual(shape.aabb, [-2, -3, -4, 2, 3, 4]);
        mesh.geometry.dispose();
    });
});

describe('Model import', () => {
    test('generic collision descriptors remain engine-neutral; Crashcat adapts the same markers', () => {
        const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
        model.name = 'wall_colonly';
        const generic = decomposeModelToPrefabNodes(model);
        assert.equal(generic.root.components.geometry, undefined);
        assert.equal(generic.root.components.collider.type, 'MeshCollider');
        assert.ok(!Object.values(generic.root.components).some(c => c.type === 'CrashcatPhysics'));
        const physics = importCollisionModel(model);
        assert.equal(physics.root.name, 'wall');
        assert.equal(physics.root.hidden, false);
        assert.equal(physics.root.components.geometry.properties.visible, false);
        assert.equal(physics.root.components.physics.type, 'CrashcatPhysics');
        model.name = 'wall';
        assert.equal(importCollisionModel(model), null);
        model.geometry.dispose();
        model.material.dispose();
    });
});


const settle = () => new Promise(resolve => setImmediate(resolve));
const target = (id, distance, revision='1') => ({id, distance, revision});

test('nearest-two terrain bodies reuse prepared shapes across camera changes', async () => {
    const built=[], active=new Set(), reports=[];
    const scheduler=createColliderResidencyScheduler({ activeLimit: 2, build:async t=>{built.push(t.id);return {id:t.id};},
        activate:id=>{active.add(id);assert.ok(active.size<=2);}, deactivate:id=>active.delete(id), report:(id,state)=>reports.push([id,state]) });
    const targets=[target('a',1),target('b',2),target('c',3)];
    for(let i=0;i<5;i++){scheduler.update(targets);await settle();}
    assert.deepEqual([...active],['a','b']); assert.equal(scheduler.ready,true); assert.equal(built.length,3);
    scheduler.update([target('a',3),target('b',2),target('c',1)]);
    assert.deepEqual([...active].sort(),['b','c']); assert.equal(built.length,3,'switching never rebuilds a collider');
    scheduler.update(targets); assert.deepEqual([...active].sort(),['a','b']);
    assert.equal(scheduler.preparedCount, 3);
    const reportsBeforeRemoval = reports.length;
    scheduler.update([]);
    assert.equal(reports.length, reportsBeforeRemoval, 'removal must not overwrite a missing-data error with ready');
    assert.equal(scheduler.preparedCount, 0, 'removed terrain releases the prepared cache');
    assert.equal(active.size, 0);
    scheduler.dispose();
});

test('changed or removed terrain ignores late worker results and failed jobs do not retry each frame', async () => {
    let resolve, builds=0;const active=new Set(),errors=[];
    const scheduler=createColliderResidencyScheduler({ activeLimit: 2,build:()=>{builds++;return new Promise(r=>resolve=r);},activate:id=>active.add(id),deactivate:id=>active.delete(id)});
    scheduler.update([target('a',0)]);await settle();scheduler.update([]);resolve({});await settle();scheduler.update([]);
    assert.equal(active.size,0);scheduler.dispose();
    const failed=createColliderResidencyScheduler({ activeLimit: 2,build:async()=>{throw Error('bad map');},activate:()=>assert.fail('must not activate'),deactivate:()=>{},report:(id,state)=>errors.push(state)});
    failed.update([target('a',0)]);await settle();for(let i=0;i<10;i++)failed.update([target('a',0)]);
    assert.equal(errors.filter(s=>s==='building').length,1);assert.equal(failed.ready,false);failed.dispose();
});

test('terrain physics requires a same-node height map', () => {
    assert.match(terrainPhysicsProblem({}), /add a Terrain/);
    assert.match(terrainPhysicsProblem({components:{terrain:{type:'Terrain',properties:{}}}}), /height map/);
    assert.equal(terrainPhysicsProblem({components:{terrain:{type:'Terrain',properties:{heightMap:'height.png'}}}}),null);
});

test('worker-cloned terrain shapes support a capsule walking across a tile seam', () => {
    registerAll();
    const settings=createWorldSettings();
    const broad=addBroadphaseLayer(settings),staticLayer=addObjectLayer(settings,broad),moving=addObjectLayer(settings,broad);
    enableCollision(settings,moving,staticLayer);
    const world=createWorld(settings), bodies=[];
    for(const x of [0,16]) {
        const shape=structuredClone(triangleMesh.create({positions:[x,0,0,x+16,0,0,x,0,16,x+16,0,16],indices:[0,2,1,1,2,3]}));
        bodies.push(rigidBody.create(world,{shape,motionType:MotionType.STATIC,objectLayer:staticLayer}));
    }
    const actor=kcc.create({shape:capsule.create({radius:.35,halfHeightOfCylinder:.55})},[8,4,8],[0,0,0,1]);
    const update=kcc.createDefaultUpdateSettings(), query=filter.forWorld(world);
    for(let i=0;i<240;i++) {
        actor.linearVelocity[0]=3;
        if(kcc.isSupported(actor)&&actor.linearVelocity[1]<0)actor.linearVelocity[1]=0;
        actor.linearVelocity[1]-=9.81/60;
        kcc.update(world,actor,1/60,[0,-9.81,0],update,undefined,query);
    }
    assert.ok(actor.position[0]>19 && actor.position[0]<21);
    assert.ok(actor.position[1]>.85 && actor.position[1]<1.05, `capsule y=${actor.position[1]}`);
    assert.equal(kcc.isSupported(actor),true);
    bodies.forEach(body=>rigidBody.remove(world,body));
});

test('a changed terrain revision cannot activate the obsolete worker shape', async () => {
    const jobs=[],used=[];
    const scheduler=createColliderResidencyScheduler({ activeLimit: 2,build:t=>new Promise(resolve=>jobs.push({t,resolve})),activate:(id,shape)=>used.push(shape),deactivate:()=>{}});
    scheduler.update([target('a',0,'old')]);await settle();
    scheduler.update([target('a',0,'new')]);jobs[0].resolve({version:'old'});await settle();
    scheduler.update([target('a',0,'new')]);await settle();
    assert.equal(used.length,0);
    jobs[1].resolve({version:'new'});await settle();scheduler.update([target('a',0,'new')]);
    assert.deepEqual(used,[{version:'new'}]);scheduler.dispose();
});

test('collider residency supports non-terrain budgets and stable equal-distance selection', async () => {
    const active = new Set();
    const lifecycle = { build: async item => ({ mesh: item.id }), activate: id => active.add(id), deactivate: id => active.delete(id) };
    for (const activeLimit of [0, -1, 1.5, Infinity]) {
        assert.throws(() => createColliderResidencyScheduler({ ...lifecycle, activeLimit }), /positive integer/);
    }
    const scheduler = createColliderResidencyScheduler({ ...lifecycle, activeLimit: 3 });
    const candidates = ['d', 'b', 'c', 'a'].map(id => target(id, 1));
    for (let i = 0; i < 5; i++) { scheduler.update(candidates); await settle(); }
    assert.deepEqual([...active], ['a', 'b', 'c']);
    scheduler.update([...candidates].reverse());
    assert.deepEqual([...active], ['a', 'b', 'c'], 'registration order cannot churn equally near bodies');
    assert.equal(scheduler.preparedCount, 4, 'preparation and active-body budgets are independent');
    scheduler.dispose();
    assert.equal(active.size, 0);
});
