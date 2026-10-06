import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { canAddComponentToNode, resolveComponentProperties, registerComponent } from '../../src/core/ComponentRegistry.ts';

import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Group } from 'three';

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

    test('exclusive slots reject competing components but allow behaviors and other slots', () => {
        const material = { name: 'Material', slot: 'material', properties: {} };
        const custom = { name: 'CustomMaterial', slot: 'material', properties: {} };
        const geometry = { name: 'Geometry', slot: 'geometry', properties: {} };
        const behavior = { name: 'Spin', properties: {} };
        const node = { id: 'box', components: { surface: { type: 'Material', properties: {} } } };
        const registry = { Material: material };
        assert.equal(canAddComponentToNode(node, custom, registry), false);
        assert.equal(canAddComponentToNode(node, geometry, registry), true);
        assert.equal(canAddComponentToNode(node, behavior, registry), true);
    });

    test('a light does not replace the mesh needed by geometry and material', async () => {
        const { analyzeNodeComponents } = await import('../../src/runtime/prefabs/nodePlan.ts');
        const { registerBuiltInComponents } = await import('../../src/viewer/index.ts');
        registerBuiltInComponents();
        const plan = analyzeNodeComponents({ id: 'lit-mesh', components: {
            light: { type: 'PointLight', properties: {} },
            geometry: { type: 'Geometry', properties: {} },
            material: { type: 'Material', properties: {} },
        } });
        assert.ok(plan.composition.some(component => component.key === '$mesh'));
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
    let viewlessUpdates = 0;
    registerComponent({ name: 'TestLifecycleOnly', properties: {}, update() { viewlessUpdates++; } });
    registerComponent({ name: 'TestMotion', properties: { speed: { default: 1 } },
    setup(ctx) {
        ready = Boolean(ctx.object && ctx.prefab.getObject('child'));
    },
    update(ctx) { ctx.object.position.y += ctx.properties.speed * ctx.delta; },
    View({ children }) {
        useEffect(() => { attached++; return () => { attached--; }; }, []);
        return children;
    } });
    const doc = createPrefabStore(JSON.parse(JSON.stringify({ root: { id: 'world', children: [{
        id: 'box', name: 'Box', components: {
            shape: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 2, 2], instanced: false } },
            paint: { type: 'Material', properties: {} },
            motion: { type: 'TestMotion', properties: { speed: 2 } },
        }, children: [{ id: 'child', name: 'Child', components: { behavior: { type: 'TestLifecycleOnly', properties: {} } } }],
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
    assert.ok(box.getObjectByName('Child'), 'behaviors preserve composed children');
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
    const { EditPickContext } = await import('../../src/runtime/scene/SelectionRuntime.tsx');
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
        name: 'ModeSwitchViewProbe',
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
            useContext(EditPickContext);
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
    const render = async (editMode, selectedId = null) => act(async () => {
        state = root.render(h(PrefabRoot, { store, editMode, selectedId, onSelect }));
    });
    await render(true);
    const child = state.getState().scene.getObjectByName('child');
    const viewObject = state.getState().scene.getObjectByName('mode-switch-view');
    assert.ok(child);
    assert.ok(viewObject);
    assert.equal(mounts, 1);
    assert.equal(renders, 1);
    assert.equal(pickReaderRenders, 1);
    assert.equal(gameObjectReaderRenders, 1);

    await render(false);
    await render(true);
    assert.equal(state.getState().scene.getObjectByName('child'), child);
    assert.equal(state.getState().scene.getObjectByName('mode-switch-view'), viewObject);
    assert.equal(mounts, 1, 'mode changes preserve composed views');
    assert.equal(unmounts, 0);
    assert.equal(renders, 1, 'views that do not use mode skip mode-only renders');
    assert.equal(pickReaderRenders, 1, 'edit-pick consumers keep a stable callback across mode changes');
    assert.equal(gameObjectReaderRenders, 1, 'object lookup does not subscribe to mode');
    assert.deepEqual(observedModes, [true, false, true], 'mode readers still update');
    assert.deepEqual(observedSelection, [false]);

    await render(true, 'child');
    await render(true);
    assert.deepEqual(observedSelection, [false, true, false], 'selection readers still update');
    assert.deepEqual(observedModes, [true, false, true], 'mode readers skip selection-only updates');
});
