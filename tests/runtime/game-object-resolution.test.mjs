import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh } from 'three';
import { createPrefabRegistry, createNodeComponentRegistry, createNodeComponentType } from '../../src/runtime/scene/SceneContext.tsx';
import { createGameObjectHandle, registerGameObjectOwner, resolveGameObject, registerRenderSources, resolveRenderSource } from '../../src/runtime/scene/gameObject.ts';
import { editPickIds } from '../../src/runtime/scene/editPicking.ts';

function owner(nodeId, scope, object) {
    const objects = createPrefabRegistry(), components = createNodeComponentRegistry();
    objects.registerObject(nodeId, object);
    const handle = createGameObjectHandle(nodeId, scope, objects, components);
    return {handle, remove: registerGameObjectOwner(object, handle), components};
}

test('nested ownership resolves imported descendants and follows reparenting', () => {
    const root = new Group(), nested = new Group(), model = new Group(), mesh = new Mesh();
    root.add(nested); nested.add(model); model.add(mesh);
    const outer = owner('placement', '', root), inner = owner('part', 'placement', nested);
    const type = createNodeComponentType('health'); inner.components.register(inner.handle.id, type, 100);
    assert.equal(resolveGameObject(mesh), inner.handle);
    assert.equal(resolveGameObject(mesh).getComponent(type), 100);
    assert.equal(inner.handle.id, 'placement/part'); assert.notEqual(inner.handle.id, nested.uuid);
    assert.equal(inner.handle.nodeId, 'part'); assert.equal(inner.handle.scope, 'placement');
    assert.deepEqual(editPickIds([{object:mesh}], {placement:{id:'placement'}}), ['placement']);
    assert.deepEqual(editPickIds([{object:mesh}], {part:{id:'part'}}, 'placement'), ['part']);
    root.add(model); assert.equal(resolveGameObject(mesh), outer.handle);
    root.remove(model); assert.equal(resolveGameObject(mesh), null);
    outer.remove(); inner.remove(); assert.equal(resolveGameObject(nested), null);
    assert.equal(resolveGameObject(new Group()), null);
});

test('render instance resolution and owner cleanup survive replacement', () => {
    const rootA = new Group(), rootB = new Group(), a = new Mesh(), b = new Mesh(), batch = new Group();
    rootA.add(a); rootB.add(b);
    const first = owner('same', 'a', rootA), second = owner('same', 'b', rootB);
    const oldMapping = registerRenderSources(batch, [a, b]);
    assert.equal(resolveGameObject(batch, 1), second.handle);
    assert.equal(resolveGameObject(batch, 0), first.handle);
    assert.equal(resolveGameObject(batch), null);
    assert.equal(resolveGameObject(batch, 2), null);
    assert.equal(resolveGameObject(batch, -1), null);
    const replacement = registerRenderSources(batch, [b, a]); oldMapping();
    assert.equal(resolveRenderSource(batch, 0), b);
    const newOwner = registerGameObjectOwner(rootA, first.handle); first.remove();
    assert.equal(resolveGameObject(a), first.handle);
    newOwner(); newOwner(); assert.equal(resolveGameObject(a), null);
    replacement(); assert.equal(resolveGameObject(batch, 0), null);
    second.remove();
});

test('mounted prefab nodes register live owners and release them on unmount', async t => {
    const {act,createElement:h}=await import('react');
    const {createRoot,extend}=await import('@react-three/fiber');
    const {PrefabRoot}=await import('../../src/runtime/prefabs/PrefabRoot.tsx');
    const {AudioContext}=await import('three');
    const previousWindow=globalThis.window;
    globalThis.window={addEventListener(){},removeEventListener(){}};
    AudioContext.setContext({createGain:()=>({connect(){}}),destination:{},listener:{}});
    extend({Group});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const canvas={width:100,height:100,style:{},addEventListener(){},removeEventListener(){}};
    const root=createRoot(canvas);
    await root.configure({gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:100,height:100,top:0,left:0},frameloop:'never'});
    t.after(async()=>{await act(async()=>root.unmount());globalThis.window=previousWindow;});
    let store;
    await act(async()=>{store=root.render(h(PrefabRoot,{id:'level',data:{root:{id:'root',children:[{id:'child'}]}}}));});
    let child;
    store.getState().scene.traverse(object=>{if(object.userData.prefabNodeId==='child')child=object;});
    assert.ok(child);
    const handle=resolveGameObject(child);
    assert.equal(handle.id,'level/child');assert.equal(handle.transform,child);
    await act(async()=>root.render(null));
    assert.equal(resolveGameObject(child),null);assert.equal(handle.transform,null);
});
