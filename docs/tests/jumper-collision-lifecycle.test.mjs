import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement as h} from 'react';
import {createRoot,extend} from '@react-three/fiber';
import {AudioContext,Group,Mesh} from 'three';
import {PrefabRoot,createPrefabStore,registerComponent,useSceneComponents} from 'react-three-game/viewer';
import {CollisionSurfaceComponent,COLLISION_SURFACE} from '../app/demo/jumper/components/CollisionSurfaceComponent.tsx';

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
