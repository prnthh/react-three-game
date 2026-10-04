import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../../src/runtime/spatial/SpatialGrid.ts';
import { Group, PointLight, Scene, Vector3 } from 'three';
import { LightCullingGridController } from 'react-three-game/viewer';

describe('Spatial lookup', () => {
    test('generic spatial membership handles negative boundaries, migration and removal', () => {
        const grid = new SpatialGrid(10), node = {}, light = {};
        assert.equal(grid.update(node, { x: -0.01, y: 10, z: 0 }), true);
        assert.equal(grid.cellOf(node), '-1,1,0');
        assert.equal(grid.update(node, { x: -9, y: 19, z: 9 }), false);
        grid.update(light, { x: -9, y: 19, z: 9 });
        assert.deepEqual([...grid.values('-1,1,0')], [node, light]);
        grid.update(node, { x: 0, y: 0, z: 0 });
        assert.deepEqual([...grid.values('-1,1,0')], [light]);
        grid.remove(light);
        assert.deepEqual([...grid.values('-1,1,0')], []);
        assert.equal(grid.cellOf(light), undefined);
        for (const size of [0, -1, Infinity, NaN]) assert.throws(() => new SpatialGrid(size));
    });
});

describe('Light culling', () => {
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

    test('discovery tracks subtree lifecycle without traversing the scene on updates', () => {
     const scene=new Scene(), area=new Group(), nested=new Group(), light=new PointLight();
     nested.add(light);area.add(nested);scene.add(area);
     const controller=new LightCullingGridController(scene);
     scene.traverse=()=>{throw new Error('frame discovery must not traverse the scene');};
     controller.update(new Vector3());assert.equal(controller.stats().authored,1);
     scene.remove(area);controller.update(new Vector3());assert.equal(controller.stats().authored,0);
     scene.add(area);controller.update(new Vector3());assert.equal(controller.stats().authored,1);
     const other=new Group();scene.add(other);other.add(nested);
     controller.update(new Vector3());assert.equal(controller.stats().authored,1);
     controller.dispose();
     assert.equal(light.layers.mask,1);
    });
});
