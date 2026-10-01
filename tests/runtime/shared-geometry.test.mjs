import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { BoxGeometry, Group } from 'three';
import { GeometryRuntimeProvider, useSharedGeometryResource } from '../../src/runtime/components/GeometryComponent.tsx';

extend({Group});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test('custom geometry is shared across instances and subtree resets, then disposed by its owner', async t=>{
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    t.after(async()=>{await act(async()=>root.unmount());});
    let builds=0,disposals=0;
    const observed=[];
    function Probe(){
        const geometry=useSharedGeometryResource('test-box',()=>{
            builds++;
            const geometry=new BoxGeometry();
            geometry.addEventListener('dispose',()=>disposals++);
            return geometry;
        });
        observed.push(geometry);
        return h('group');
    }
    const render=async version=>act(async()=>root.render(h(GeometryRuntimeProvider,null,
        h('group',{key:version},h(Probe),h(Probe)))));
    await render(1);
    await render(2);
    assert.equal(builds,1);
    assert.ok(observed.every(g=>g===observed[0]));
    assert.equal(disposals,0);
    await act(async()=>root.render(null));
    assert.equal(disposals,1);
});
