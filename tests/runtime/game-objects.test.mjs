import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Group, Mesh } from 'three';
import { createGameObjectHandle, registerGameObjectOwner, resolveGameObject, registerRenderSources, resolveRenderSource } from '../../src/runtime/scene/gameObject.ts';
import { createPrefabRegistry, createNodeComponentRegistry, createNodeComponentType, PrefabContext, NodeComponentContext, NodeScope, RuntimeNodeIdScope, useGameObject } from '../../src/runtime/scene/SceneContext.tsx';
import { editPickIds } from '../../src/runtime/scene/editPicking.ts';
import { notifyObjectChanged } from '../../src/runtime/scene/objectChanges.ts';

describe('Handles and scoped lookup', () => {
    const ANIMATOR = createNodeComponentType('test animator');

    test('one object handle follows late mounting, component replacement and unloading', () => {
        const objects = createPrefabRegistry();
        const components = createNodeComponentRegistry();
        const player = createGameObjectHandle('player', 'level/npc', objects, components);
        assert.equal(player.transform, null);
        assert.equal(player.getComponent(ANIMATOR), null);
        const transform = new Group();
        const animator = { play: () => 'walk' };
        objects.registerObject('player', transform);
        components.register(player.id, ANIMATOR, animator);
        assert.equal(player.transform, transform);
        assert.equal(player.getComponent(ANIMATOR).play(), 'walk');
        const replacement = { play: () => 'run' };
        components.register(player.id, ANIMATOR, replacement);
        assert.equal(player.getComponent(ANIMATOR), replacement);
        components.register(player.id, ANIMATOR, null);
        objects.registerObject('player', null);
        assert.equal(player.transform, null);
        assert.equal(player.getComponent(ANIMATOR), null);
    });

    test('the hook resolves current and named objects in the same nested prefab scope', () => {
        const objects = createPrefabRegistry();
        const components = createNodeComponentRegistry();
        const transform = new Group();
        objects.registerObject('player', transform);
        components.register('world/placement/player', ANIMATOR, { name: 'local' });
        components.register('world/other/player', ANIMATOR, { name: 'other instance' });
        function Probe() {
            const self = useGameObject();
            const player = useGameObject('player');
            assert.equal(self.id, player.id);
            assert.equal(self.id, 'world/placement/player');
            assert.equal(player.transform, transform);
            assert.equal(player.getComponent(ANIMATOR).name, 'local');
            return null;
        }
        renderToStaticMarkup(createElement(PrefabContext.Provider, { value: objects },
            createElement(NodeComponentContext.Provider, { value: components },
                createElement(RuntimeNodeIdScope, { prefix: 'world' },
                    createElement(RuntimeNodeIdScope, { prefix: 'placement' },
                        createElement(NodeScope, { nodeId: 'player' }, createElement(Probe)))))));
    });
});

describe('Ownership and picking resolution', () => {
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
});

describe('Change notifications', () => {
    test('transform changes notify descendants and compound owners, excluding sibling branches', () => {
        const root = new Group(), parent = new Group(), child = new Group(), sibling = new Group();
        root.add(parent, sibling); parent.add(child);
        const calls = [];
        const releases = [root, parent, child, sibling].map((object, id) => {
            const listener = () => calls.push(id);
            object.addEventListener('objectchange', listener);
            return () => object.removeEventListener('objectchange', listener);
        });
        notifyObjectChanged(parent);
        assert.deepEqual(calls, [1, 2, 0]);
        calls.length = 0;
        notifyObjectChanged(parent, 'geometry');
        assert.deepEqual(calls, [1, 0], 'geometry changes do not invalidate unrelated descendant bodies');
        releases.forEach(release => release());
        calls.length = 0;
        notifyObjectChanged(root);
        assert.deepEqual(calls, []);
    });

    test('notifications use native Object3D events and are explicit', () => {
        const parent = new Group(), child = new Group(); parent.add(child);
        let calls = 0;
        const listener = event => { assert.equal(event.target, child); calls++; };
        child.addEventListener('objectchange', listener);
        child.addEventListener('objectchange', listener);
        child.position.x = 3;
        child.updateMatrixWorld();
        assert.equal(calls, 0, 'ordinary simulation writes do not feed back into subscribers');
        notifyObjectChanged(child);
        assert.equal(calls, 1);
    });
});
