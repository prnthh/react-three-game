import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSceneAuthoring } from '../../src/editor/agent/sceneAuthoringAdvice.ts';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { createSceneAgent } from '../../src/editor/agent/sceneAgent.ts';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import { createPrefabHistory } from '../../src/core/prefabHistory.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import Geometry from '../../src/runtime/components/GeometryComponent.tsx';
import Mesh from '../../src/runtime/components/MeshComponent.tsx';
import Transform from '../../src/runtime/components/TransformComponent.tsx';
import Material from '../../src/runtime/components/MaterialComponent.tsx';
import Model from '../../src/runtime/components/ModelComponent.tsx';
[Geometry, Mesh, Transform, Material, Model].forEach(registerComponent);
const box = i => ({id:`box-${i}`, components:{mesh:{type:'Mesh',properties:{instanced:false}},geometry:{type:'Geometry',properties:{geometryType:'box',args:[i+1,1,1]}}}});
function fixture() {
    const store = createPrefabStore({root:{id:'world'}});
    const history = createPrefabHistory(store); history.connect();
    const scene = createSceneAgent(store,()=>({mode:()=> 'edit',selectedId:()=>null,transaction:history.transaction,beforeCommit(){},undo:history.undo,redo:history.redo,history:history.getSnapshot,canSave:()=>false,save:async()=>{},focusNode(){},captureView:async()=>({mimeType:'image/png',dataUrl:'',width:1,height:1})})).scene;
    return {store,scene};
}

test('advice is bounded, ignores disabled subtrees, and does not change documents', () => {
    const prefab = {root:{id:'world',children:Array.from({length:60},(_,i)=>box(i))}};
    const state = normalizePrefab(prefab);
    const before = structuredClone(state);
    const report = analyzeSceneAuthoring(state);
    assert.equal(report.stats.distinctBoxSizes,60);
    assert.deepEqual(report.advisories.map(a=>a.code),['unique-box-geometry','instancing-disabled','flat-hierarchy']);
    assert.ok(report.advisories.every(a=>a.nodeIds.length<=8 && a.count===60));
    assert.deepEqual(state,before);
    const hidden = normalizePrefab({root:{id:'world',children:[{id:'disabled',disabled:true,children:prefab.root.children}]}});
    assert.equal(analyzeSceneAuthoring(hidden).stats.meshNodes,0);
    const shared = normalizePrefab({root:{id:'world',children:[{id:'assembly',children:prefab.root.children.map(n=>({...n,components:{...n.components,mesh:{type:'Mesh',properties:{}},geometry:{type:'Geometry',properties:{args:[1,1,1]}}}}))}]}});
    assert.deepEqual(analyzeSceneAuthoring(shared).advisories,[]);
});

test('validation reports the proposed document, batch agrees, undo clears advice', () => {
    const {scene,store} = fixture();
    const before = store.getState();
    const batch = {expectedRevision:scene.info().revision,commands:[{op:'add',parentId:'world',node:{id:'assembly',children:Array.from({length:9},(_,i)=>box(i))}}]};
    const validated = scene.validate(batch);
    assert.strictEqual(store.getState(),before);
    assert.equal(validated.advisories.length,2);
    const result = scene.batch(batch);
    assert.deepEqual(result.advisories,validated.advisories);
    assert.deepEqual(scene.analyze().advisories,result.advisories);
    result.advisories[0].nodeIds.length=0;
    assert.ok(scene.analyze().advisories[0].nodeIds.length>0);
    scene.undo({expectedRevision:result.revision});
    assert.deepEqual(scene.analyze().advisories,[]);
});
