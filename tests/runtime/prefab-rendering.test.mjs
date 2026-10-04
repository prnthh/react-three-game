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
});

// Exercise the document-to-scene path; custom behavior is application-owned.
test('JSON attaches registered behaviors and built-ins; editor API edits update the live scene', async t => {
    const { useFrame } = await import('@react-three/fiber');
    const { useEffect } = await import('react');
    const { Mesh, Box3, Vector3 } = await import('three');
    const { PrefabRoot, registerBuiltInComponents, useGameObject } = await import('../../src/viewer.ts');
    const { createSceneAgent } = await import('../../src/editor/agent/sceneAgent.ts');
    const { exposeSceneAgent } = await import('../../src/editor/agent/sceneAgentBridge.ts');
    registerBuiltInComponents();
    extend({ Group, Mesh });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let attached = 0;
    registerComponent({ name: 'TestMotion', properties: { speed: { default: 1 } }, View({ properties, children }) {
        const object = useGameObject();
        useEffect(() => { attached++; return () => { attached--; }; }, []);
        useFrame((_, delta) => { object.transform.position.y += properties.speed * delta; });
        return children;
    } });
    const doc = createPrefabStore(JSON.parse(JSON.stringify({ root: { id: 'world', children: [{
        id: 'box', name: 'Box', components: {
            shape: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 2, 2], instanced: false } },
            paint: { type: 'Material', properties: {} },
            motion: { type: 'TestMotion', properties: { speed: 2 } },
        }, children: [{ id: 'child', name: 'Child' }],
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
    const size = new Box3().setFromObject(box).getSize(new Vector3());
    assert.deepEqual(size.toArray(), [2, 2, 2]);
    await act(async () => state.getState().advance(1, false));
    assert.equal(box.position.y, 2);

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
