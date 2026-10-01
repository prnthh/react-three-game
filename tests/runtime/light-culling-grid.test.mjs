import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, PointLight, Scene, Vector3} from 'three';
import {LightCullingGridController} from 'react-three-game/viewer';
const visibleLights=scene=>{const ids=[];scene.traverseVisible(o=>{if(o.isLight&&o.layers.isEnabled(0))ids.push(o.id);});return ids;};
test('3D cells activate all nearby lights without budgets, preserving shader light identities across cell crossings',()=>{
 const scene=new Scene(),registry=new LightCullingGridController(scene,{cellSize:24,neighborRadius:1});
 const lights=[];
 for(let i=0;i<200;i++) {
  const light=new PointLight('#ffffff',10,20);light.position.set(5,(i%10)*100,Math.floor(i/10)*100);
  scene.add(light);lights.push(light);
 }
 registry.update(new Vector3(5,5,5));
 assert.equal(registry.stats().authored,200);assert.equal(registry.stats().slots,1);
 assert.deepEqual(registry.stats().activeIds,[lights[0].id]);
 const ids=visibleLights(scene);
 registry.update(new Vector3(23,23,23));assert.deepEqual(registry.stats().activeIds,[lights[0].id]);
 registry.update(new Vector3(5,105,5));assert.deepEqual(registry.stats().activeIds,[lights[1].id]);
 assert.deepEqual(visibleLights(scene),ids,'vertical cell crossing reuses the same renderer light');
 lights[1].visible=false;registry.update(new Vector3(5,105,5));
 assert.equal(registry.stats().active,0);assert.deepEqual(visibleLights(scene),ids);
 lights[1].visible=true;registry.update(new Vector3(5,105,5));assert.equal(registry.stats().active,1);
 registry.dispose();assert.equal(visibleLights(scene).length,200);
});

test('grid sizes for the densest neighborhood and never drops active lights or reallocates on a hide',()=>{
 const scene=new Scene(),registry=new LightCullingGridController(scene,{cellSize:24,neighborRadius:0}),area=new Group();scene.add(area);
 for(let i=0;i<12;i++) {const light=new PointLight();light.position.x=i;light.castShadow=i<2;area.add(light);}
 registry.update(new Vector3(5,5,5));
 assert.equal(registry.stats().slots,12);assert.equal(registry.stats().active,12);
 const ids=visibleLights(scene);
 area.visible=false;registry.update(new Vector3(5,5,5));
 assert.equal(registry.stats().active,0);assert.deepEqual(visibleLights(scene),ids);
 area.visible=true;registry.update(new Vector3(-1,5,5));assert.equal(registry.stats().active,0,'negative cell coordinates use floor');
 registry.update(new Vector3(5,5,5));assert.equal(registry.stats().active,12);
 registry.dispose();
});

test('scene traversal discovers ordinary lights added later, restores removed lights, and leaves gizmos alone',()=>{
 const scene=new Scene(),controller=new LightCullingGridController(scene,{cellSize:10,neighborRadius:0});
 controller.update(new Vector3(1,1,1));assert.equal(controller.stats().authored,0);
 const light=new PointLight('#ffffff',3),gizmo=new Group();light.add(gizmo);light.layers.enable(3);scene.add(light);
 controller.update(new Vector3(1,1,1));assert.equal(controller.stats().active,1);
 const ids=visibleLights(scene),mask=9;
 assert.equal(light.layers.mask,0);assert.equal(gizmo.visible,true);assert.equal(gizmo.layers.mask,1);
 light.position.y=30;controller.update(new Vector3(1,1,1));
 assert.equal(controller.stats().active,0);assert.equal(gizmo.visible,true);assert.deepEqual(visibleLights(scene),ids);
 scene.remove(light);controller.update(new Vector3(1,1,1));
 assert.equal(controller.stats().authored,0);assert.equal(light.layers.mask,mask);
 scene.add(light);controller.update(new Vector3(1,31,1));assert.equal(controller.stats().active,1);
 controller.dispose();assert.equal(light.layers.mask,mask);assert.deepEqual(visibleLights(scene),[light.id]);
});
