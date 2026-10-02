import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import { roughenGeometry } from '../app/demo/jumper/components/WeatheredGeometryComponent.ts';

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
