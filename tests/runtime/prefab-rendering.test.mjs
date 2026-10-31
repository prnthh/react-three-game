import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { canAddComponentToNode, resolveComponentProperties, registerComponent } from '../../src/core/ComponentRegistry.ts';

import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { useComponentActive, useGameObject, usePrefab } from '../../src/viewer/index.ts';

describe('Component contracts', () => {
    test('schema defaults resolve sparse JSON without replacing authored values', () => {
        const component = { name: 'Example', properties: {
            size: { default: 2 },
            width: { default: values => values.size * 2 },
            color: { type: 'color', default: '#ffffff' },
        } };
        const authored = { size: 3, color: '#000000' };
        assert.deepEqual(resolveComponentProperties(component, authored), { size: 3, width: 6, color: '#000000' });
        assert.deepEqual(authored, { size: 3, color: '#000000' });
    });

    test('exclusive groups reject competing components independently of render slots', () => {
        const material = { name: 'Material', slot: 'material', exclusive: 'material', properties: {} };
        const custom = { name: 'CustomMaterial', slot: 'material', exclusive: 'material', properties: {} };
        const geometry = { name: 'Geometry', slot: 'geometry', properties: {} };
        const behavior = { name: 'Spin', properties: {} };
        const node = { id: 'box', components: { surface: { type: 'Material', properties: {} } } };
        const registry = { Material: material };
        assert.equal(canAddComponentToNode(node, custom, registry), false);
        assert.equal(canAddComponentToNode(node, geometry, registry), true);
        assert.equal(canAddComponentToNode(node, behavior, registry), true);
        assert.equal(canAddComponentToNode(node, { ...custom, slot: 'object' }, registry), false,
            'the exclusive group, not the rendering role, defines a conflict');
        assert.equal(canAddComponentToNode(node, { ...custom, exclusive: undefined }, registry), true,
            'a rendering slot alone does not impose an authoring constraint');
    });

    test('composition orders materials inside geometry without injecting render objects', async () => {
        const { analyzeNodeComponents } = await import('../../src/runtime/prefabs/nodePlan.ts');
        const { registerBuiltInComponents } = await import('../../src/viewer/index.ts');
        registerBuiltInComponents();
        const plan = analyzeNodeComponents({ id: 'lit-mesh', components: {
            light: { type: 'PointLight', properties: {} },
            material: { type: 'Material', properties: {} },
            geometry: { type: 'Geometry', properties: {} },
        } });
        assert.deepEqual(plan.composition.map(component => component.key), ['light', 'geometry', 'material']);
    });
});

// Exercise the document-to-scene path; custom behavior is application-owned.
test('JSON attaches registered behaviors and built-ins; editor API edits update the live scene', async t => {
    const { useEffect } = await import('react');
    const { Mesh, Box3, Vector3 } = await import('three');
    const { PrefabRoot, registerBuiltInComponents } = await import('../../src/viewer/index.ts');
    const { createSceneAgent } = await import('../../src/editor/agent/sceneAgent.ts');
    const { exposeSceneAgent } = await import('../../src/editor/agent/sceneAgentBridge.ts');
    registerBuiltInComponents();
    extend({ Group, Mesh });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let attached = 0;
    let ready = false;
    registerComponent({ name: 'TestObjectWrapper', slot: 'object', properties: {}, View: ({ children }) => h('group', null, children) });
    let viewlessUpdates = 0;
    registerComponent({ name: 'TestFrameBehavior', properties: {}, View({ children }) { useFrame(() => { viewlessUpdates++; }); return children; } });
    registerComponent({ name: 'TestMotion', properties: { speed: { default: 1 } },
    View({ properties, children }) {
        const node = useGameObject();
        const prefab = usePrefab();
        useEffect(() => { ready = Boolean(node.transform && prefab.getObject('child')); }, [node, prefab]);
        useFrame((_, delta) => { node.transform.position.y += properties.speed * delta; });
        useEffect(() => { attached++; return () => { attached--; }; }, []);
        return children;
    } });
    const doc = createPrefabStore(JSON.parse(JSON.stringify({ root: { id: 'world', children: [{
        id: 'box', name: 'Box', components: {
            data: { type: 'Data', properties: { data: { team: 'blue', prefabNodeId: 'fake', prefabNodeName: 'Fake', prefabNodeScope: 'fake' } } },
            paint: { type: 'Material', properties: { color: '#ff0000' } },
            shape: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 2, 2], instanced: false } },
            object: { type: 'TestObjectWrapper', properties: {} },
            motion: { type: 'TestMotion', properties: { speed: 2 } },
        }, children: [{ id: 'child', name: 'Child', components: { behavior: { type: 'TestFrameBehavior', properties: {} } } }],
    }] } })));
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let state;
    await act(async () => { state = root.render(h(PrefabRoot, { store: doc })); });
    const scene = state.getState().scene;
    const box = scene.getObjectByName('Box');
    assert.ok(box);
    assert.deepEqual(box.userData, { prefabNodeId: 'box', prefabNodeName: 'Box', prefabNodeScope: '', team: 'blue' },
        'application data cannot overwrite renderer metadata');
    assert.ok(box.getObjectByName('Child'), 'behaviors preserve composed children');
    const meshes = []; box.traverse(object => { if (object.isMesh) meshes.push(object); });
    assert.equal(meshes.length, 1, 'geometry owns its mesh even alongside an object wrapper');
    assert.equal(meshes[0].material.color.getHexString(), 'ff0000', 'material attaches regardless of JSON key order');
    assert.equal(attached, 1);
    assert.equal(ready, true, 'own and committed descendant refs are registered before setup');
    const size = new Box3().setFromObject(box).getSize(new Vector3());
    assert.deepEqual(size.toArray(), [2, 2, 2]);
    await act(async () => state.getState().advance(1, false));
    assert.equal(box.position.y, 2);
    assert.equal(viewlessUpdates, 1);

    const target = {};
    const agent = createSceneAgent(doc, () => ({ mode: () => 'edit', beforeCommit() {}, transaction: action => action() })).scene;
    const release = exposeSceneAgent(target, agent);
    t.after(release);
    await act(async () => target.scene.update({ id: 'box', components: { motion: { properties: { speed: 4 } } } }));
    await act(async () => state.getState().advance(2, false));
    assert.equal(scene.getObjectByName('Box'), box, 'a property edit preserves the live object');
    assert.equal(box.position.y, 6);
    assert.equal(JSON.parse(target.scene.exportJSON()).root.children[0].components.motion.properties.speed, 4);
    await act(async () => target.scene.remove({ id: 'box' }));
    assert.equal(scene.getObjectByName('Box'), undefined);
    assert.equal(attached, 0);
});

test('changing prefab metadata updates the mounted root without replacing its object', async t => {
    const { PrefabRoot } = await import('../../src/viewer/index.ts');
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const store = createPrefabStore({ id: 'first', root: { id: 'root', name: 'Before' } });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let state;
    await act(async () => { state = root.render(h(PrefabRoot, { store })); });
    const before = state.getState().scene.getObjectByName('Before');
    assert.ok(before);
    await act(async () => store.getState().replacePrefab({ id: 'second', root: { id: 'root', name: 'After' } }));
    assert.equal(state.getState().scene.getObjectByName('After'), before);
});

test('switching edit mode preserves composed views and skips unrelated renders', async t => {
    const { useContext, useEffect } = await import('react');
    const { PrefabRoot, registerBuiltInComponents, useGameObject, useNode } = await import('../../src/viewer/index.ts');
    const { InstanceClickContext } = await import('../../src/runtime/rendering/MeshInstanceProvider.tsx');
    const { EditorSelection } = await import('../../src/editor/selection.tsx');
    registerBuiltInComponents();
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let mounts = 0;
    let unmounts = 0;
    let renders = 0;
    let pickReaderRenders = 0;
    let gameObjectReaderRenders = 0;
    const observedModes = [];
    const observedSelection = [];
    registerComponent({
        name: 'ModeSwitchViewProbe', renderWhenDisabled: true,
        properties: {},
        View({ children }) {
            renders++;
            useEffect(() => {
                mounts++;
                return () => { unmounts++; };
            }, []);
            return h('group', { name: 'mode-switch-view' }, children);
        },
    });
    registerComponent({
        name: 'ModeSwitchReaderProbe',
        properties: {},
        View({ children }) {
            observedModes.push(useNode(node => node.editMode));
            return children;
        },
    });
    registerComponent({
        name: 'ModeSwitchPickReaderProbe',
        properties: {},
        View({ children }) {
            useContext(InstanceClickContext);
            pickReaderRenders++;
            return children;
        },
    });
    registerComponent({
        name: 'ModeSwitchObjectReaderProbe',
        properties: {},
        View({ children }) {
            assert.equal(useGameObject().id, 'child');
            gameObjectReaderRenders++;
            return children;
        },
    });
    registerComponent({
        name: 'ModeSwitchSelectionReaderProbe',
        properties: {},
        View({ children }) {
            observedSelection.push(useNode(node => node.isSelected));
            return children;
        },
    });
    const store = createPrefabStore({ root: { id: 'root', children: [{
        id: 'child', name: 'child', components: {
            geometry: { type: 'Geometry', properties: { instanced: false } },
            material: { type: 'Material', properties: { name: 'mode-paint', color: '#ff0000' } },
            probe: { type: 'ModeSwitchViewProbe', properties: {} },
            reader: { type: 'ModeSwitchReaderProbe', properties: {} },
            pickReader: { type: 'ModeSwitchPickReaderProbe', properties: {} },
            objectReader: { type: 'ModeSwitchObjectReaderProbe', properties: {} },
            selectionReader: { type: 'ModeSwitchSelectionReaderProbe', properties: {} },
        },
    }] } });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });

    let state;
    const onSelect = () => {};
    const render = async (editMode, selectedId = null, enabled = true) => act(async () => {
        state = root.render(h(EditorSelection, { store, selectedId, onSelect, enabled: editMode },
            h(PrefabRoot, { store, editMode, enabled })));
    });
    await render(true);
    const child = state.getState().scene.getObjectByName('child');
    const viewObject = state.getState().scene.getObjectByName('mode-switch-view');
    let material;
    child.traverse(object => { if (object.isMesh) material = object.material; });
    assert.ok(child);
    assert.ok(viewObject);
    assert.ok(material);
    assert.equal(mounts, 1);
    const initialRenders = renders;
    const initialPickReaderRenders = pickReaderRenders;
    const initialObjectReaderRenders = gameObjectReaderRenders;
    const initialModes = [...observedModes];
    const initialSelection = [...observedSelection];

    await render(false);
    await render(true);
    assert.equal(state.getState().scene.getObjectByName('child'), child);
    assert.equal(state.getState().scene.getObjectByName('mode-switch-view'), viewObject);
    child.traverse(object => { if (object.isMesh) assert.equal(object.material, material); });
    assert.equal(mounts, 1, 'mode changes preserve composed views');
    assert.equal(unmounts, 0);
    assert.equal(renders, initialRenders, 'views that do not use mode skip mode-only renders');
    assert.equal(pickReaderRenders, initialPickReaderRenders, 'edit-pick consumers keep a stable callback across mode changes');
    assert.equal(gameObjectReaderRenders, initialObjectReaderRenders, 'object lookup does not subscribe to mode');
    assert.deepEqual(observedModes, [...initialModes, false, true], 'mode readers still update');
    assert.deepEqual(observedSelection, initialSelection);

    await render(true, 'child');
    await render(true);
    assert.deepEqual(observedSelection, [...initialSelection, true, false], 'selection readers still update');
    assert.deepEqual(observedModes, [...initialModes, false, true], 'mode readers skip selection-only updates');

    await render(false, null, false);
    assert.equal(state.getState().scene.getObjectByName('mode-switch-view'), viewObject);
    assert.equal(mounts, 1, 'disabled Views and their descendants stay mounted');
    assert.equal(unmounts, 0);
    await render(false);
    assert.equal(state.getState().scene.getObjectByName('mode-switch-view'), viewObject);
    assert.equal(mounts, 1, 'reenabling does not rebuild the scene graph');
});

test('Views choose their disabled lifetime and gate behavior with React hooks', async t => {
    const { useEffect } = await import('react');
    const { PrefabRoot } = await import('../../src/runtime/prefabs/PrefabRoot.tsx');
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const counts = {};
    for (const persistent of [false, true]) {
        const name = persistent ? 'PersistentLifecycleView' : 'DefaultLifecycleView';
        const count = counts[name] = { mounts: 0, unmounts: 0, starts: 0, stops: 0, updates: 0 };
        registerComponent({ name, renderWhenDisabled: persistent, properties: {},
            View({ children, enabled }) {
                const active = useComponentActive(enabled);
                useEffect(() => {
                    if (!active) return;
                    count.starts++;
                    return () => { count.stops++; };
                }, [active]);
                useFrame(() => { if (active) count.updates++; });
                useEffect(() => { count.mounts++; return () => { count.unmounts++; }; }, []);
                return h('group', { name }, children);
            },
        });
    }
    const data = { root: { id: 'root', children: Object.keys(counts).map(name => ({
        id: name, components: { behavior: { type: name, properties: {} } },
    })) } };
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let state;
    const render = async enabled => act(async () => { state = root.render(h(PrefabRoot, { data, enabled })); });
    await render(false);
    assert.equal(counts.DefaultLifecycleView.mounts, 0);
    assert.equal(counts.PersistentLifecycleView.mounts, 1);
    await render(true);
    const persistentObject = state.getState().scene.getObjectByName('PersistentLifecycleView');
    await act(async () => state.getState().advance(1, false));
    await render(false);
    await act(async () => state.getState().advance(2, false));
    for (const count of Object.values(counts)) {
        assert.equal(count.starts, 1);
        assert.equal(count.stops, 1);
        assert.equal(count.updates, 1, 'disabled behavior does not run');
    }
    assert.equal(counts.DefaultLifecycleView.unmounts, 1);
    assert.equal(counts.PersistentLifecycleView.unmounts, 0);
    await render(true);
    assert.equal(state.getState().scene.getObjectByName('PersistentLifecycleView'), persistentObject);
    assert.equal(counts.DefaultLifecycleView.mounts, 2);
    assert.equal(counts.PersistentLifecycleView.mounts, 1);
});

test('bone attachments follow bones, preserve child ownership and rebind on model replacement', async t => {
    const { useMemo, useEffect, StrictMode } = await import('react');
    const { Bone, Mesh, Vector3, AnimationClip, NumberKeyframeTrack } = await import('three');
    const { PrefabRoot, registerBuiltInComponents, useRegisterNodeComponent, resolveGameObject } = await import('../../src/viewer/index.ts');
    const { SKINNED_MESH_COMPONENT, useSkinnedModel } = await import('../../src/runtime/components/SkinnedMeshComponent.tsx');
    registerBuiltInComponents(); extend({ Group, Mesh });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const rigs = [], sources = [];
    registerComponent({ name: 'AttachmentTestRig', properties: { version: { default: 0 } },
        View({ properties, children }) {
            const source = useMemo(() => {
                const rig = new Group(), bone = new Bone(); bone.name = 'hand'; bone.position.y = 2;
                rig.add(bone); rig.animations = [new AnimationClip('wave', 1, [new NumberKeyframeTrack('hand.position[x]', [0,1], [0,1])])];
                sources.push(rig); return rig;
            }, [properties.version]);
            const handle = useSkinnedModel(source);
            useMemo(() => { rigs.push(handle.object); }, [handle.object]);
            useRegisterNodeComponent(SKINNED_MESH_COMPONENT, handle);
            useEffect(() => { handle.setAnimationState('wave', true); handle.update(0); }, [handle]);
            return h('group', null, h('primitive', { object: handle.object, dispose: null }), children);
        },
    });
    const doc = createPrefabStore({ root: { id: 'root', children: [{
        id: 'actor', name: 'Actor', components: {
            transform: { type: 'Transform', properties: { position: [5, 0, 0], scale: [2, 2, 2] } },
            model: { type: 'AttachmentTestRig', properties: {} },
        }, children: [{ id: 'socket', name: 'Attachment', components: {
            transform: { type: 'Transform', properties: { position: [100, 0, 0] } },
            attachment: { type: 'BoneAttachment', properties: { targetId: 'actor', bone: 'hand' } },
        }, children: [{ id: 'equipment', name: 'Equipment', components: {
            transform: { type: 'Transform', properties: { position: [0, 1, 0] } },
            geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [.1, .1, .1], instanced: false } },
        }, children: [{ id: 'gun', name: 'Gun', components: {
            transform: { type: 'Transform', properties: { position: [0, 0, 1] } },
        } }] }] }] }, {id:'other',name:'Other'}] } });
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    let store;
    await act(async () => { store = root.render(h(StrictMode, null, h(PrefabRoot, { store: doc }))); });
    const scene = store.getState().scene;
    const model = resolveGameObject(scene.getObjectByName('Actor')).getComponent(SKINNED_MESH_COMPONENT);
    let bone = model.getBone('hand'), gun = scene.getObjectByName('Gun');
    assert.equal(model.object.getObjectByName('hand'), bone);
    assert.equal(model.bones[0], bone);
    assert.equal(model.getBone('missing'), null);
    assert.notEqual(bone, sources[0].getObjectByName('hand'), 'model instance owns its bones');
    model.setAnimationState('wave', true); model.update(.25);
    assert.ok(Math.abs(bone.position.x - .25) < 1e-8);
    assert.equal(sources[0].getObjectByName('hand').position.x, 0, 'cached source rig is unchanged');
    model.stop(); bone.position.x = 0;
    const attachment = scene.getObjectByName('Attachment');
    assert.notEqual(attachment.parent, bone, 'the attachment parent retains its original hierarchy');
    assert.equal(attachment.position.x, 100, 'the parent transform stays outside the portal');
    assert.equal(scene.getObjectByName('Equipment').parent, bone);
    assert.ok(scene.getObjectByName('Equipment').children.some(object => object.isMesh), 'equipment geometry composes inside its own transform');
    assert.equal(resolveGameObject(scene.getObjectByName('Attachment')).nodeId, 'socket');
    assert.equal(resolveGameObject(gun).nodeId, 'gun', 'portal retains prefab node identity');
    assert.deepEqual(gun.getWorldPosition(new Vector3()).toArray(), [5, 6, 2]);
    bone.position.x = 3;
    assert.deepEqual(gun.getWorldPosition(new Vector3()).toArray(), [11, 6, 2], 'follows animated bone without a frame callback');
    const update = async (id, fn) => act(async () => doc.getState().updateNode(id, fn));
    await update('socket', node => ({ ...node, hidden: true }));
    assert.equal(scene.getObjectByName('Gun').visible, false, 'logical parent visibility survives the portal');
    await update('socket', node => ({ ...node, hidden: false }));
    await update('actor', node => ({ ...node, components: { ...node.components,
        model: { type: 'AttachmentTestRig', properties: { version: 1 } },
    } }));
    assert.equal(bone.children.length, 0, 'old skeleton has no orphaned attachment');
    bone = rigs.at(-1).getObjectByName('hand'); gun = scene.getObjectByName('Gun');
    assert.equal(scene.getObjectByName('Equipment').parent, bone, 'replacement bone gets a fresh portal container');
    assert.equal(scene.getObjectByName('Attachment'), attachment, 'rebinding preserves the attachment parent');
    const setBone = async name => update('socket', node => ({...node, components: {
        ...node.components,
        attachment: {type:'BoneAttachment',properties:{targetId:'actor',bone:name}},
    }}));
    await setBone('missing');
    assert.equal(scene.getObjectByName('Gun'), undefined);
    assert.equal(scene.getObjectByName('Attachment'), attachment, 'missing targets only hide portal content');
    await setBone('hand');
    assert.equal(scene.getObjectByName('Equipment').parent, bone);
    await update('actor', node => ({...node, components: {transform:node.components.transform}}));
    assert.equal(scene.getObjectByName('Gun'), undefined, 'unloaded skeleton hides attachment');
    assert.equal(bone.children.length, 0);
});

test("two-bone IK reaches weapon grips without stretching, including transformed rigs", async () => {
  const { Object3D, Vector3, Quaternion } = await import('three');
  const { TwoBoneIK } = await import('../../src/runtime/animation/TwoBoneIK.ts');
  const root = new Object3D(), upper = new Object3D(), lower = new Object3D(), hand = new Object3D();
  root.add(upper); upper.add(lower); lower.add(hand);
  lower.position.y = 1; hand.position.y = 0.8;
  root.position.set(4, 2, -7); root.rotation.set(0.2, 0.6, -0.1); root.scale.setScalar(0.7);
  root.updateMatrixWorld(true);
  const target = root.localToWorld(new Vector3(0.6, 1, -0.4));
  const pole = root.localToWorld(new Vector3(1, 0, 0));
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.8);
  const solver = new TwoBoneIK(upper, lower, hand);
  solver.solve(target, pole, 1, rotation);
  assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(target) < 1e-6);
  assert.ok(hand.getWorldQuaternion(new Quaternion()).angleTo(rotation) < 1e-6);
  assert.equal(lower.position.length(), 1);
  assert.equal(hand.position.length(), 0.8);
  const saved = upper.quaternion.clone();
  solver.solve(new Vector3(100, 100, 100), pole, 0);
  assert.ok(upper.quaternion.equals(saved), 'zero weight preserves authored animation');
  solver.solve(new Vector3(100, 100, 100), pole);
  assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(upper.getWorldPosition(new Vector3())) <= 1.26 + 1e-6);
  solver.solve(upper.getWorldPosition(new Vector3()), upper.getWorldPosition(new Vector3()));
  assert.ok(hand.getWorldPosition(new Vector3()).toArray().every(Number.isFinite), 'coincident target and pole stay finite');
});
