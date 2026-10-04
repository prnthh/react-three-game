import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, AudioContext, Group, Mesh } from 'three';
import { roughenGeometry } from '../app/demo/parkour/components/WeatheredGeometryComponent.ts';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { applyProps, createRoot, extend } from '@react-three/fiber';
import { MaterialComponent } from '../../src/viewer.ts';
import { ConcreteMaterialComponent, createConcreteMaterialOverrides } from '../app/demo/parkour/components/ConcreteMaterialComponent.tsx';
import { act, createElement as h } from 'react';
import { PrefabRoot, createPrefabStore, registerComponent, useSceneComponents } from 'react-three-game/viewer';
import { CollisionSurfaceComponent, COLLISION_SURFACE } from '../app/demo/parkour/components/CollisionSurfaceComponent.tsx';

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
