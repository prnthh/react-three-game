import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { Color, Group, Mesh } from 'three';
import { PrefabRoot, registerBuiltInComponents } from '../../src/viewer/index.ts';
import { createPrefabStore, prefabStoreToPrefab } from '../../src/core/prefabStore.ts';
import { SceneRuntime } from '../../src/runtime/SceneRuntime.tsx';

registerBuiltInComponents();
extend({ Group, Mesh });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const box = (id, properties) => ({ id, name: id, components: {
    geometry: { type: 'Geometry', properties: { instanced: false } },
    material: { type: 'Material', properties },
} });
const document = (id, children) => createPrefabStore({ root: { id, children } });

async function host(t) {
    const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
    const root = createRoot(canvas);
    await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
        size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
    t.after(async () => { await act(async () => root.unmount()); });
    return root;
}
function mesh(scene, name) {
    const node = scene.getObjectByName(name);
    let result;
    node.traverse(object => { if (object.isMesh) result = object; });
    return result;
}

test('ID references resolve across loaded prefabs, follow edits, and empty on definition unload', async t => {
    const root = await host(t);
    const references = document('references', [box('reference', { name: 'paint' }), box('unrelated', { name: 'unknown' })]);
    const definitions = document('definitions', [box('owner', { name: 'paint', color: '#ff0000' })]);
    let state;
    const render = async loaded => act(async () => {
        state = root.render(h(SceneRuntime, null,
            h(PrefabRoot, { key: 'references', store: references }),
            loaded && h(PrefabRoot, { key: 'definitions', store: definitions })));
    });
    await render(false);
    const scene = state.getState().scene;
    const reference = mesh(scene, 'reference');
    assert.equal(reference.material.visible, false);
    await render(true);
    assert.equal(reference.material.visible, true);
    assert.equal(reference.material, mesh(scene, 'owner').material);
    assert.ok(reference.material.color.equals(new Color('#ff0000')));
    assert.equal(mesh(scene, 'unrelated').material.visible, false);
    await act(async () => definitions.getState().updateNode('owner', node => ({ ...node, components: { ...node.components,
        material: { type: 'Material', properties: { name: 'paint', color: '#00ff00' } },
    } })));
    assert.ok(reference.material.color.equals(new Color('#00ff00')));
    assert.equal(reference.material, mesh(scene, 'owner').material);
    await render(false);
    assert.equal(reference.material.visible, false);
    await render(true);
    assert.ok(reference.material.color.equals(new Color('#00ff00')));
    const saved = prefabStoreToPrefab(definitions.getState());
    assert.equal(saved.materials, undefined);
    assert.equal(saved.root.children[0].components.material.properties.color, '#00ff00');
    assert.deepEqual(prefabStoreToPrefab(references.getState()).root.children[0].components.material.properties, { name: 'paint' });
});

test('separate scene runtimes do not share material IDs, and explicit defaults remain definitions', async t => {
    const root = await host(t);
    const owner = document('a', [box('white-owner', { name: 'paint', materialType: 'standard', color: '#ffffff' })]);
    const reference = document('b', [box('isolated', { name: 'paint' })]);
    let state;
    await act(async () => { state = root.render(h(GroupComponent)); });
    function GroupComponent() { return h('group', null, h(PrefabRoot, { store: owner }), h(PrefabRoot, { store: reference })); }
    assert.equal(mesh(state.getState().scene, 'white-owner').material.visible, true);
    assert.equal(mesh(state.getState().scene, 'isolated').material.visible, false);
    const saved = prefabStoreToPrefab(owner.getState());
    assert.equal(saved.root.children[0].components.material.properties.materialType, 'standard');
    assert.equal(saved.root.children[0].components.material.properties.color, '#ffffff');
});

test('editing a material definition keeps its priority over a duplicate definition', async t => {
    const root = await host(t);
    const store = document('root', [
        box('owner', { name: 'metal', metalness: 1, roughness: 0.2 }),
        box('duplicate', { name: 'metal', metalness: 0, roughness: 1 }),
        box('reference', { name: 'metal' }),
    ]);
    let state;
    await act(async () => { state = root.render(h(PrefabRoot, { store })); });
    const scene = state.getState().scene;
    for (const metalness of [0.8, 0.4, 1]) {
        await act(async () => store.getState().updateNode('owner', node => ({ ...node, components: {
            ...node.components, material: { ...node.components.material, properties: { ...node.components.material.properties, materialType: 'standard', metalness, roughness: 0.2 } },
        } })));
        for (const id of ['owner', 'duplicate', 'reference']) {
            assert.equal(mesh(scene, id).material.metalness, metalness);
            assert.equal(mesh(scene, id).material, mesh(scene, 'owner').material);
        }
    }
});

test('UI and command duplicates keep material references and attachment without copying definitions', async () => {
    const { evaluateSceneCommands } = await import('../../src/core/sceneCommands.ts');
    const original = box('owner', { name: 'paint', materialType: 'standard', metalness: 0.8, attach: 'material-0' });
    original.children = [box('child', { name: 'paint', color: '#ff0000' })];
    const prefab = { root: { id: 'root', children: [original] } };
    const store = createPrefabStore(prefab);
    const copyId = store.getState().duplicateNode('owner');
    const commandCopy = evaluateSceneCommands(prefab, { commands: [{ op: 'duplicate', id: 'owner', newId: 'copy' }] }).prefab.root.children.find(node => node.id === 'copy');
    for (const copy of [prefabStoreToPrefab(store.getState()).root.children.find(node => node.id === copyId), commandCopy]) {
        assert.deepEqual(copy.components.material.properties, { name: 'paint', attach: 'material-0' });
        assert.deepEqual(copy.children[0].components.material.properties, { name: 'paint' });
    }
    assert.equal(store.getState().materials.paint.metalness, 0.8);
    assert.equal(original.components.material.properties.metalness, 0.8);
});

test('renaming a material component only changes that node', () => {
    const store = document('root', [box('owner', { name: 'metal', metalness: 1 }), box('ref', { name: 'metal' }), box('other', { name: 'wood', color: '#884422' })]);
    let updates = 0;
    store.subscribe(() => updates++);
    store.getState().updateNode('owner', node => ({ ...node, components: {
        ...node.components, material: { ...node.components.material, properties: { ...node.components.material.properties, name: 'steel', metalness: 0.9 } },
    } }));
    assert.equal(updates, 1);
    assert.equal(store.getState().nodesById.ref.components.material.properties.name, 'metal');
    assert.equal(store.getState().materials.metal, undefined);
    assert.equal(store.getState().materials.steel.metalness, 0.9);
    assert.equal(updates, 1);
});
