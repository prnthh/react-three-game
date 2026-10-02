import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { rigidBody } from 'crashcat';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { PrefabRoot } from '../../src/runtime/prefabs/PrefabRoot.tsx';
import { SceneRuntime } from '../../src/runtime/SceneRuntime.tsx';
import Camera from '../../src/runtime/components/CameraComponent.tsx';
import Geometry from '../../src/runtime/components/GeometryComponent.tsx';
import Physics from '../../src/plugins/crashcat/CrashcatPhysicsComponent.tsx';
import { CrashcatRuntime } from '../../src/plugins/crashcat/CrashcatRuntime.tsx';
import { getPhysicsScene } from '../../src/plugins/crashcat/physicsScene.ts';
import { notifyObjectChanged } from '../../src/runtime/scene/objectChanges.ts';

extend(THREE);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const component of [Camera, Geometry, Physics]) registerComponent(component);
registerComponent({ name: 'ContinuityMesh', slot: 'object', properties: {}, View: ({ children }) => h('mesh', null, children) });
const box = id => ({ id, name: id, components: {
    mesh: { type: 'ContinuityMesh' }, geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
} });

async function fixture(t, data, physics = false) {
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    THREE.AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {} });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    const doc = createPrefabStore(data);
    let store;
    const render = async (editMode, version = 0) => {
        await act(async () => { store = root.render(h(SceneRuntime, null,
            h(PrefabRoot, { key: version, store: doc, editMode }, physics ? h(CrashcatRuntime) : null))); });
    };
    return { doc, render, get state() { return store.getState(); } };
}

for (const projection of ['perspective', 'orthographic']) {
    test(`${projection} camera and descendants survive mode switches; reset remounts them`, async t => {
        const f = await fixture(t, { root: { id: 'root', children: [
            { id: 'camera', name: 'camera', components: { camera: { type: 'Camera', properties: { projection } } }, children: [box('attached')] },
            box('sibling'),
        ] } });
        await f.render(true);
        const scene = f.state.scene;
        const editorCamera = f.state.camera;
        const camera = scene.getObjectByName('camera').children[0].children[0];
        const attached = scene.getObjectByName('attached');
        const sibling = scene.getObjectByName('sibling');
        for (const mode of [false, true, false, true]) {
            await f.render(mode);
            assert.ok(scene.getObjectByName('attached') === attached, 'camera descendants stay mounted');
            assert.ok(scene.getObjectByName('sibling') === sibling);
            assert.ok(f.state.camera === (mode ? editorCamera : camera), 'default camera switches without recreation');
        }
        await f.render(true, 1);
        assert.notEqual(scene.getObjectByName('attached'), attached);
        assert.notEqual(scene.getObjectByName('sibling'), sibling);
    });
}

test('physics preserves bodies and velocity across modes, rebuilding only edited ancestor transforms or reset', async t => {
    const bodyNode = id => ({ ...box(id), components: { ...box(id).components,
        physics: { type: 'CrashcatPhysics', properties: { type: 'dynamic' } },
    } });
    const f = await fixture(t, { root: { id: 'root', children: [
        { id: 'parent', children: [bodyNode('body')] }, bodyNode('other'),
    ] } }, true);
    await f.render(false);
    const api = getPhysicsScene(f.state.scene).getSnapshot();
    const body = api.getBody('body'), other = api.getBody('other');
    assert.ok(body);
    const shape = body.shape, otherShape = other.shape;
    rigidBody.setLinearVelocity(api.world, body, [3, 4, 5]);
    await act(async () => f.state.advance(0.016, false));
    const velocity = [...body.motionProperties.linearVelocity];
    for (const mode of [true, false, true]) {
        await f.render(mode);
        assert.ok(api.getBody('body') === body);
        assert.ok(api.getBody('body').shape === shape, 'mode switches reuse the collider');
        assert.deepEqual(body.motionProperties.linearVelocity, velocity);
    }
    await act(async () => f.doc.getState().updateNode('parent', node => ({ ...node,
        components: { transform: { type: 'Transform', properties: { position: [10, 0, 0], scale: [2, 2, 2] } } },
    })));
    assert.notEqual(api.getBody('body').shape, shape);
    assert.equal(api.getBody('other'), other);
    assert.equal(api.getBody('other').shape, otherShape);
    const object = f.state.scene.getObjectByName('body');
    assert.deepEqual(api.getBody('body').position, object.getWorldPosition(new THREE.Vector3()).toArray());
    const editedShape = api.getBody('body').shape;
    await f.render(false);
    assert.equal(api.getBody('body').shape, editedShape, 'edits synchronize before switching modes');
    await act(async () => {
        object.position.x += 5;
        notifyObjectChanged(object);
    });
    assert.deepEqual(api.getBody('body').position, object.getWorldPosition(new THREE.Vector3()).toArray(),
        'imperative changes synchronize during Play');
    assert.equal(api.getBody('other').shape, otherShape);
    const externalShape = api.getBody('body').shape;
    await act(async () => {
        object.children.find(child => child.isMesh).geometry = new THREE.BoxGeometry(4, 2, 3);
        notifyObjectChanged(object, 'geometry');
    });
    assert.notEqual(api.getBody('body').shape, externalShape);
    assert.equal(api.getBody('other').shape, otherShape);
    await f.render(false, 1);
    assert.notEqual(getPhysicsScene(f.state.scene).getSnapshot(), api);
});

test('compound colliders react to geometry changes, not unrelated component edits', async t => {
    const f = await fixture(t, { root: { id: 'owner', components: {
        physics: { type: 'CrashcatPhysics', properties: { type: 'fixed' } },
    }, children: [box('visual')] } }, true);
    await f.render(false);
    const api = getPhysicsScene(f.state.scene).getSnapshot();
    const shape = api.getBody('owner').shape;
    await act(async () => f.doc.getState().updateNode('visual', node => ({ ...node,
        components: { ...node.components, metadata: { type: 'UnregisteredBehavior', properties: { value: 1 } } },
    })));
    assert.ok(api.getBody('owner').shape === shape, 'unrelated edits do not invalidate compound geometry');
    await act(async () => f.doc.getState().updateNode('visual', node => ({ ...node,
        components: { ...node.components, geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [4, 2, 3] } } },
    })));
    assert.ok(api.getBody('owner').shape !== shape, 'actual geometry changes update the compound owner');
});
