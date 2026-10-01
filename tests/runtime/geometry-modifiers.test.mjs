import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement as h} from 'react';
import {createRoot,extend} from '@react-three/fiber';
import {AudioContext,BoxGeometry,Group,Mesh} from 'three';
import Geometry, {applyGeometryModifiers,getGeometryModifiers} from '../../src/runtime/components/GeometryComponent.tsx';
import WeatheredGeometry, {roughenGeometry} from '../../src/runtime/components/WeatheredGeometryComponent.ts';
import {registerComponent,canAddComponentToNode} from '../../src/core/ComponentRegistry.ts';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import {PrefabRoot} from '../../src/runtime/prefabs/PrefabRoot.tsx';

registerComponent(Geometry);registerComponent(WeatheredGeometry);
extend({Group,Mesh});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const geometry={type:'Geometry',properties:{geometryType:'box',args:[2,3,4,3,4,5]}};
const weather={type:'WeatheredGeometry',properties:{amount:.12,seed:17}};

test('weathering composes with primitive geometry, independent of material and component key',()=>{
 const node={id:'box',components:{shape:geometry,damage:weather}};
 assert.equal(canAddComponentToNode({id:'base',components:{shape:geometry}},WeatheredGeometry),true);
 const source=new BoxGeometry(2,3,4,3,4,5);
 const before=source.attributes.position.array.slice();
 const modifiers=getGeometryModifiers(node);
 const result=applyGeometryModifiers(source,modifiers);
 assert.notEqual(result,source);
 assert.deepEqual(source.attributes.position.array,before);
 assert.equal(getGeometryModifiers({id:'plain',components:{shape:geometry}}).length,0);
 assert.equal(modifiers[0].properties.preserveTop,false,'uses registry defaults');
 source.dispose();result.dispose();
});

test('geometry modifiers update immediately, stay node-local and restore the shared base when removed',async t=>{
 const previousWindow=globalThis.window;
 globalThis.window={addEventListener(){},removeEventListener(){}};
 AudioContext.setContext({createGain:()=>({connect(){}}),destination:{},listener:{}});
 registerComponent({name:'TestGeometryMesh',slot:'object',properties:{},View:({children})=>h('mesh',null,children)});
 const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
 const root=createRoot(canvas);
 await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
 t.after(async()=>{await act(async()=>root.unmount());globalThis.window=previousWindow;});
 const mesh={type:'TestGeometryMesh',properties:{}};
 const doc=createPrefabStore({root:{id:'world',children:[
  {id:'a',name:'a',components:{mesh,shape:geometry},children:[{id:'child',name:'child',components:{mesh,shape:geometry}}]},
  {id:'b',name:'b',components:{mesh,shape:geometry}},
 ]}});
 let store;await act(async()=>{store=root.render(h(PrefabRoot,{store:doc,editMode:true}));});
 const find=name=>store.getState().scene.getObjectByName(name).children.find(o=>o.isMesh);
 const a=find('a'),b=find('b'),child=find('child'),base=a.geometry;
 assert.equal(base.attributes.position.count,new BoxGeometry(2,3,4,3,4,5).attributes.position.count,'subdivisions retained');
 assert.equal(b.geometry,base);
 const update=async components=>act(async()=>doc.getState().updateNode('a',n=>({...n,components:{mesh,shape:geometry,...components}})));
 await update({damage:weather});
 assert.equal(find('a'),a,'no mesh remount');
 assert.notEqual(a.geometry,base);
 assert.equal(b.geometry,base);assert.equal(child.geometry,base,'does not leak to descendants');
 const rough=a.geometry;
 await update({damage:{...weather,properties:{...weather.properties,amount:.25}}});
 assert.notEqual(a.geometry,rough);
 assert.notDeepEqual(a.geometry.attributes.position.array,rough.attributes.position.array);
 await update({damage:weather});assert.equal(a.geometry,rough,'same parameters reuse cached geometry');
 await update({});assert.equal(a.geometry,base,'removing modifier restores base without reset');
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

test('weathering compensates for scale and preserves grounded bases and landings',()=>{
    const source=new BoxGeometry(1,1,1,3,3,3).toNonIndexed();
    const original=source.attributes.position.array;
    const scale=[3,40,2];
    const result=roughenGeometry(source,.075,17,true,true,scale).attributes.position.array;
    for(let i=0;i<original.length;i+=3){
        for(let j=0;j<3;j++)assert.ok(Math.abs((result[i+j]-original[i+j])*scale[j])<.07501);
        if(Math.abs(original[i+1])===.5)assert.deepEqual(result.slice(i,i+3),original.slice(i,i+3));
    }
});
