import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group } from 'three';
import { AssetRuntimeProvider } from '../../src/runtime/assets/AssetRuntime.tsx';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import PrefabRef from '../../src/runtime/components/PrefabRefComponent.tsx';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import { encodePrefabSource, isEmbeddedPrefabSource, loadPrefabSource } from '../../src/runtime/prefabs/prefabSource.ts';
import { scopePrefabMaterials, createDefaultMaterial, normalizePrefab, reconcilePrefabState } from '../../src/core/prefab.ts';
import { withBasePath } from "../../src/runtime/assets/assetPaths.ts";

extend({ Group });
registerComponent(PrefabRef);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('URL, percent-encoded and base64 prefabs normalize identically and reject bad documents', async () => {
    const prefab={name:'Étagère',root:{id:'asset',name:'木'}};
    const remote=await loadPrefabSource('/asset.json',async()=>new Response(JSON.stringify(prefab)));
    const embedded=await loadPrefabSource(encodePrefabSource(prefab));
    const base64=`data:application/json;base64,${Buffer.from(JSON.stringify(prefab)).toString('base64')}`;
    assert.deepEqual(remote,embedded);
    assert.deepEqual(await loadPrefabSource(base64),embedded);
    assert.equal(isEmbeddedPrefabSource(base64),true);
    assert.equal(isEmbeddedPrefabSource('data:text/json;charset=utf-8,{}'),true);
    assert.equal(isEmbeddedPrefabSource('/asset.json'),false);
    const uppercase=encodePrefabSource(prefab).replace('data:', 'DATA:');
    assert.equal(withBasePath('/game',uppercase),uppercase,'recognized inline sources must bypass the base path');
    assert.deepEqual(await loadPrefabSource(withBasePath('/game',uppercase)),embedded);
    assert.equal(withBasePath('/game','HTTPS://example.com/asset.json'),'HTTPS://example.com/asset.json');
    await assert.rejects(loadPrefabSource('/missing.json',async()=>new Response('',{status:404})),/404/);
    await assert.rejects(loadPrefabSource('data:application/json,not-json'),/Invalid prefab document from embedded prefab/);
    await assert.rejects(loadPrefabSource('/bad.json',async()=>new Response('{}')),/Invalid prefab/);
});

test('unpacking scopes an omitted default material instead of inheriting the outer default', () => {
    const scoped=scopePrefabMaterials({root:{id:'asset',components:{paint:{type:'Material',properties:{}}}}},'instance');
    assert.equal(scoped.root.components.paint.properties.materialId,'instance:default');
    assert.deepEqual(scoped.materials['instance:default'],createDefaultMaterial());
    const missing=scopePrefabMaterials({root:{id:'asset',components:{paint:{type:'Material',properties:{materialId:'outer-only'}}}}},'instance');
    assert.equal(missing.root.components.paint.properties.materialId,'instance:default','unresolved asset IDs must retain their local fallback after unpack');
});

test('mounted cached URL and embedded references retain documents; reads share the rendered definition', async t => {
    const nativeFetch=globalThis.fetch;
    const documents = new Map();
    let revision='original',requests=0;
    globalThis.fetch=async url=>{
        if(String(url).startsWith('data:'))return nativeFetch(url);
        requests++;
        if (documents.has(url)) return new Response(JSON.stringify(documents.get(url)));
        return new Response(JSON.stringify({root:{id:'asset',name:revision}}));
    };
    t.after(()=>{globalThis.fetch=nativeFetch;});
    const previousWindow=globalThis.window;
    globalThis.window={addEventListener(){},removeEventListener(){}};
    AudioContext.setContext({createGain:()=>({connect(){}}),destination:{},listener:{}});
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    const runtimeRef={current:null};
    let store;
    const render=async children=>act(async()=>{store=root.render(h(AssetRuntimeProvider,{runtimeRef},children));});
    t.after(async()=>{await render(null);await act(async()=>root.unmount());globalThis.window=previousWindow;});
    await render(null);
    const embedded=encodePrefabSource({root:{id:'embedded',name:'embedded-original',children:[{id:'kept',name:'kept-child'},{id:'edited',name:'before-edit'}]}});
    // Preloaded definitions reproduce the old cached fast path, which never retained a lease.
    await act(async()=>{await runtimeRef.current.readPrefab('/asset.json');await runtimeRef.current.readPrefab(embedded);});
    const scene={root:{id:'world',children:[
        {id:'url-instance',components:{ref:{type:'PrefabRef',properties:{url:'/asset.json'}}}},
        {id:'inline-instance',components:{ref:{type:'PrefabRef',properties:{url:embedded}}}},
    ]}};
    const documentStore=createPrefabStore(scene);
    await render(h(PrefabRoot,{store:documentStore}));
    assert.ok(store.getState().scene.getObjectByName('original'));
    revision='changed-on-server';
    await act(async()=>{for(let i=0;i<40;i++)await runtimeRef.current.readPrefab(`/idle-${i}.json`);});
    assert.ok(runtimeRef.current.getPrefab('/asset.json'),'mounted URL must remain pinned');
    assert.ok(runtimeRef.current.getPrefab(embedded),'mounted embedded definition must remain pinned');
    let exported;
    await act(async()=>{exported=await runtimeRef.current.readPrefab('/asset.json');});
    assert.equal(exported.root.name,'original','unpack must use the visible definition, not fetch a newer version');
    exported.root.name='mutated copy';
    assert.equal(runtimeRef.current.getPrefab('/asset.json').nodesById.asset.name,'original');
    assert.equal(requests,41);
    await render(h(PrefabRoot,{store:documentStore}));
    assert.ok(store.getState().scene.getObjectByName('original'));
    assert.ok(store.getState().scene.getObjectByName('embedded-original'));
    const beforeRoot=store.getState().scene.getObjectByName('embedded-original');
    const beforeChild=store.getState().scene.getObjectByName('kept-child');
    const beforeEdited=store.getState().scene.getObjectByName('before-edit');
    const replacement=encodePrefabSource({root:{id:'embedded',name:'embedded-updated',children:[
        {id:'kept',name:'kept-child'},{id:'edited',name:'after-edit'},
    ]}});
    await act(async()=>documentStore.getState().updateNode('inline-instance',n=>({...n,components:{ref:{type:'PrefabRef',properties:{url:replacement}}}})));
    assert.equal(store.getState().scene.getObjectByName('embedded-updated'),beforeRoot,'root stays mounted across source edits');
    assert.equal(store.getState().scene.getObjectByName('kept-child'),beforeChild,'unchanged objects stay mounted');
    assert.equal(store.getState().scene.getObjectByName('after-edit'),beforeEdited,'edited objects update in place');

    // Direct rendering must enforce the same cycle protection as preparation.
    const loop = encodePrefabSource({root:{id:'inner',name:'inner',children:[
        {id:'back',components:{ref:{type:'PrefabRef',properties:{url:'/cycle.json'}}},children:[{id:'kept',name:'cycle-placement-child'}]},
    ]}});
    documents.set('/cycle.json',{root:{id:'cycle-root',name:'cycle-root',components:{ref:{type:'PrefabRef',properties:{url:loop}}}}});
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
        await act(async()=>documentStore.getState().replacePrefab({root:{id:'world',children:[
            {id:'first',components:{ref:{type:'PrefabRef',properties:{url:'/cycle.json'}}}},
            {id:'second',components:{ref:{type:'PrefabRef',properties:{url:'/cycle.json'}}}},
        ]}}));
        const names = [];
        store.getState().scene.traverse(object => names.push(object.name));
        assert.equal(names.filter(name=>name==='cycle-root').length,2,'sibling instances remain valid');
        assert.equal(names.filter(name=>name==='cycle-placement-child').length,2,'cycle guard preserves placement children');
        assert.equal(warnings.filter(args=>String(args[0]).includes('Cyclic prefab reference')).length,2);
    } finally { console.warn = originalWarn; }
});


test('prefab reconciliation preserves unchanged selector identities and removes deleted records', () => {
    const before=normalizePrefab({root:{id:'root',children:[{id:'a',name:'A'},{id:'b',name:'B'}]}});
    const next=normalizePrefab({root:{id:'root',children:[{id:'a',name:'changed'},{id:'b',name:'B'}]}});
    const reconciled=reconcilePrefabState(before,next);
    assert.equal(reconciled.nodesById.b,before.nodesById.b);
    assert.equal(reconciled.nodesById.root,before.nodesById.root);
    assert.notEqual(reconciled.nodesById.a,before.nodesById.a);
    assert.equal(reconciled.childIdsById,before.childIdsById);
    assert.equal(reconciled.materials,before.materials);
    assert.equal(reconciled.parentIdById,before.parentIdById);
    const removed=reconcilePrefabState(reconciled,normalizePrefab({root:{id:'root',children:[{id:'b',name:'B'}]}}));
    assert.equal(removed.nodesById.a,undefined);
    assert.deepEqual(removed.childIdsById.root,['b']);
});
