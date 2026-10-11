import { CharacterPartComponent, CharacterVisualsComponent, CharacterVisualsContext, createVisualRig, resetVisualGait, stepVisualGait } from '../app/demo/parkour/components/CharacterVisuals.tsx';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, AudioContext, Group, Mesh } from 'three';
import { roughenGeometry } from '../app/demo/parkour/components/WeatheredGeometryComponent.ts';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { applyProps, createRoot, extend } from '@react-three/fiber';
import { MaterialComponent } from '../../src/viewer/index.ts';
import { ConcreteMaterialComponent, createConcreteMaterialOverrides } from '../app/demo/parkour/components/ConcreteMaterialComponent.tsx';
import { act, createElement as h } from 'react';
import { PrefabRoot, createPrefabStore, registerComponent, useSceneComponents } from 'react-three-game/viewer';
import { CollisionSurfaceComponent, COLLISION_SURFACE, resolveCollisionSurfaceSize, useCollisionWorld } from '../app/demo/parkour/components/CollisionSurfaceComponent.tsx';

describe('Geometry', () => {
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

    test('weathering compensates for scale and preserves grounded bases and landings',()=>{
        const source=new BoxGeometry(1,1,1,3,3,3).toNonIndexed();
        const original=source.attributes.position.array;
        const scale=[3,40,2];
        const result=roughenGeometry(source,.075,17,true,true,1,scale).attributes.position.array;
        for(let i=0;i<original.length;i+=3){
            for(let j=0;j<3;j++)assert.ok(Math.abs((result[i+j]-original[i+j])*scale[j])<.07501);
            if(Math.abs(original[i+1])===.5)assert.deepEqual(result.slice(i,i+3),original.slice(i,i+3));
        }
    });

     test('scalar displacement strength scales all axes uniformly and zero leaves vertices unchanged',()=>{
        const source=new BoxGeometry(1,1,1,3,3,3).toNonIndexed();
        const original=source.attributes.position.array;
        const normal=roughenGeometry(source,.05,17,false,false,1).attributes.position.array;
        const doubled=roughenGeometry(source,.05,17,false,false,2).attributes.position.array;
        const disabled=roughenGeometry(source,.05,17,false,false,0).attributes.position.array;
        assert.deepEqual(disabled,original);
        for(let i=0;i<original.length;i++)assert.ok(Math.abs(doubled[i]-original[i]-2*(normal[i]-original[i]))<1e-6);
    });
});

describe('Materials', () => {
    test('concrete variations share a shader while uniforms follow the current material', () => {
        const create = properties => applyProps(new MeshStandardNodeMaterial(), createConcreteMaterialOverrides(properties));
        const first = create({ color: '#89816a', weathering: 1, scale: 1, roughness: 0.96 });
        const second = create({ color: '#334455', weathering: 0.2, scale: 3, roughness: 0.5 });
        assert.equal(first.customProgramCacheKey(), second.customProgramCacheKey());
        const references = new Set();
        first.colorNode.traverse(node => { if (node.constructor.type === 'ReferenceNode') references.add(node); });
        first.normalNode.traverse(node => { if (node.constructor.type === 'ReferenceNode') references.add(node); });
        assert.deepEqual([...references].map(node => node.property).sort(), ['material.color', 'material.userData.scale', 'material.userData.weathering']);
        for (const material of [first, second, first]) {
            for (const reference of references) {
                // Shadow passes can replace the frame material; the source mesh still owns our values.
                reference.updateReference({ object: { material }, material: {} });
                reference.update({ material });
                const expected = reference.property.split('.').reduce((value, key) => value[key], { material });
                assert.equal(reference.node.value, expected);
            }
        }
        first.dispose();
        second.dispose();
    });

    test('ConcreteMaterial extends the regular Material contract',()=>{
        assert.equal(ConcreteMaterialComponent.name,'ConcreteMaterial');
        assert.equal(ConcreteMaterialComponent.slot,MaterialComponent.slot);
        assert.equal(ConcreteMaterialComponent.properties.name,MaterialComponent.properties.name);
        assert.equal(ConcreteMaterialComponent.properties.attach,MaterialComponent.properties.attach);
    });
});

describe('Collision lifecycle', () => {
    extend({Group,Mesh});
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    test('loading sibling prefab colliders preserves the active collision world', async t => {
        registerComponent(CollisionSurfaceComponent);
        const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
        const root = createRoot(canvas);
        await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
            size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
        t.after(async () => { await act(async () => root.unmount()); });
        const document = { root: { id: 'root', children: [{ id: 'floor', components: {
            collision: { type: 'CollisionSurface', properties: {} },
            geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [10, 1, 10] } },
        } }] } };
        let world;
        function Probe() { world = useCollisionWorld(); return null; }
        const render = async sibling => act(async () => { root.render(h('group', null,
            h(PrefabRoot, { key: 'a', id: 'a', data: document }, h(Probe)),
            sibling && h(PrefabRoot, { key: 'b', id: 'b', data: document }))); });
        await render(false);
        assert.ok(world);
        const original = world;
        await render(true);
        assert.equal(world, original);
        await render(false);
        assert.equal(world, original);
    });
    test('disabling an area unregisters collisions without remounting its mesh subtree',async t=>{
     const previousWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
     AudioContext.setContext({createGain:()=>({connect(){}}),destination:{},listener:{}});
     registerComponent(CollisionSurfaceComponent);
     registerComponent({name:'CollisionLifecycleMesh',slot:'object',renderWhenDisabled:true,properties:{},View:({children})=>h('mesh',{name:'persistent-mesh'},children)});
     const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
     const root=createRoot(canvas);
     await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
     t.after(async()=>{await act(async()=>root.unmount());globalThis.window=previousWindow;});
     const doc=createPrefabStore({root:{id:'world',children:[{id:'area',children:[{id:'box',components:{collision:{type:'CollisionSurface',properties:{}},mesh:{type:'CollisionLifecycleMesh',properties:{}}}}]}]}});
     let caps=[],store;function Probe(){caps=useSceneComponents(COLLISION_SURFACE);return null;}
     await act(async()=>{store=root.render(h(PrefabRoot,{store:doc},h(Probe)));});
     const mesh=store.getState().scene.getObjectByName('persistent-mesh');assert.ok(mesh);assert.equal(caps.length,1);
     for(const disabled of [true,false,true,false]) {
      await act(async()=>doc.getState().updateNode('area',n=>({...n,disabled})));
      assert.equal(store.getState().scene.getObjectByName('persistent-mesh'),mesh);
      assert.equal(caps.length,disabled?0:1);
     }
    });
});

test('collision dimensions come from the primitive independently of weathering',()=>{
    const node={id:'piece',components:{
        shape:{type:'Geometry',properties:{geometryType:'box',args:[2,6,4,3,8,3]}},
        damage:{type:'WeatheredGeometry',properties:{amount:.4,seed:3}},
    }};
    assert.deepEqual(resolveCollisionSurfaceSize(node),[2,6,4]);
    delete node.components.damage;
    assert.deepEqual(resolveCollisionSurfaceSize(node),[2,6,4]);
    node.components.shape.properties.geometryType='cylinder';
    assert.deepEqual(resolveCollisionSurfaceSize(node),null);
});

test('authored body and arms share a pose while replay visuals move independently', async t => {
    extend({ Group, Mesh });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    registerComponent(CharacterVisualsComponent);
    registerComponent(CharacterPartComponent);
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    const visuals = { player: createVisualRig(), replay: createVisualRig(), color: '#b8a47d' };
    const data = { root: { id: 'runner', children: [false, true].map(replay => ({
        id: replay ? 'replay' : 'player',
        components: { visuals: { type: 'ParkourVisuals', properties: { replay } } },
        children: ['body', 'left-arm', 'right-arm'].map((part, index) => ({
            id: `${replay}-${part}`, name: part,
            components: {
                transform: { type: 'Transform', properties: { position: [index, 0, 0] } },
                ...(index ? { joint: { type: 'ParkourBodyPart', properties: { shape: 'none', joint: part } } }
                    : { part: { type: 'ParkourBodyPart', properties: { radius: 0.1, length: 0.6 } } }),
            },
            children: index ? [
                { id: `${replay}-${part}-upper`, components: { part: { type: 'ParkourBodyPart', properties: {} } } },
                { id: `${replay}-${part}-elbow`, components: {
                    transform: { type: 'Transform', properties: { position: [0, -0.3, 0] } },
                    joint: { type: 'ParkourBodyPart', properties: { shape: 'none', joint: part.replace('arm', 'forearm') } },
                }, children: [{ id: `${replay}-${part}-lower`, components: { part: { type: 'ParkourBodyPart', properties: {} } } }] },
            ] : [],
        })),
    })) } };
    const render = editMode => h(CharacterVisualsContext.Provider, { value: visuals }, h(PrefabRoot, { data, editMode }));
    await act(async () => { root.render(render(false)); });
    for (const [key, replay] of [['player', false], ['replay', true]]) {
        const { root: body, pose } = visuals[key];
        const meshes = [];
        pose.current.traverse(object => { if (object.isMesh) meshes.push(object); });
        assert.equal(meshes.length, 5);
        assert.equal(new Set(meshes.map(mesh => mesh.material)).size, 1, 'parts share one material per rig');
        for (const mesh of meshes) {
            assert.equal(mesh.castShadow, !replay);
            assert.equal(mesh.material.transparent, replay);
        }
        for (const name of ['body', 'left-arm', 'right-arm']) assert.ok(pose.current.getObjectByName(name));
        assert.equal(body.current.visible, !replay);
        const arm = visuals[key].joints.get('left-arm');
        const elbow = visuals[key].joints.get('left-forearm');
        let ancestor = elbow.parent;
        while (ancestor && ancestor !== arm) ancestor = ancestor.parent;
        assert.equal(ancestor, arm, 'the forearm inherits shoulder rotation');
        stepVisualGait(visuals[key], { grounded: true, crouched: false, velocity: [0, -13] }, 0.1);
        assert.ok(arm.rotation.x > 0);
        assert.ok(elbow.rotation.x > 0.15);
    }
    assert.notEqual(visuals.player.root.current.parent, visuals.replay.root.current.parent);
    visuals.player.pose.current.rotation.x = 1;
    visuals.player.root.current.position.x = 10;
    assert.equal(visuals.replay.pose.current.rotation.x, 0);
    assert.equal(visuals.replay.root.current.position.x, 0);
    await act(async () => { root.render(render(true)); });
    assert.equal(visuals.player.pose.current.rotation.x, 0, 'editing restores the standing pose');
    assert.equal(visuals.replay.root.current.visible, true);
    assert.equal(visuals.replay.root.current.position.x, 3, 'editing shows the replay beside the player');
});


test('running gait opposes arms and legs, bends elbows, and resets independently for replay', () => {
    const player = createVisualRig(), replay = createVisualRig();
    for (const rig of [player, replay]) {
        for (const side of ['left', 'right']) for (const part of ['arm', 'forearm', 'leg']) {
            rig.joints.set(`${side}-${part}`, new Group());
        }
    }
    const state = { grounded: true, crouched: false, velocity: [0, -13] };
    const dt = 1 / 120;
    for (let i = 0; i < 20; i++) stepVisualGait(player, state, dt);
    // Playback receives the same fixed ticks, independent of render grouping.
    for (let frame = 0; frame < 5; frame++) for (let i = 0; i < 4; i++) stepVisualGait(replay, state, dt);
    for (const [name, joint] of player.joints) assert.deepEqual(joint.rotation.toArray(), replay.joints.get(name).rotation.toArray());
    for (const joint of player.joints.values()) {
        assert.equal(joint.rotation.y, 0, 'gait only animates X rotation');
        assert.equal(joint.rotation.z, 0, 'sideways angles belong to prefab transforms');
    }
    const angle = name => player.joints.get(name).rotation.x;
    assert.ok(Math.abs(angle('left-arm')) > 0.1);
    assert.equal(angle('left-arm'), -angle('right-arm'));
    assert.ok(angle('left-arm') * angle('left-leg') < 0);
    assert.ok(angle('left-forearm') > 0.5);
    for (const resting of [{ ...state, velocity: [0, 0] }, { ...state, crouched: true }, { ...state, grounded: false }]) {
        for (let i = 0; i < 120; i++) stepVisualGait(player, resting, dt);
        assert.ok(Math.abs(angle('left-arm')) < 0.0001);
    }
    resetVisualGait(replay);
    assert.equal(replay.phase, 0);
    assert.equal(replay.joints.get('left-arm').rotation.x, 0);
    assert.equal(replay.joints.get('left-forearm').rotation.x, 0.15);
    assert.equal(Math.abs(replay.joints.get('left-arm').rotation.y), 0);
    assert.equal(Math.abs(replay.joints.get('left-forearm').rotation.z), 0);
});
