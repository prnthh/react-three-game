import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneAgent } from '../../src/editor/agent/sceneAgent.ts';
import { exposeSceneAgent } from '../../src/editor/agent/sceneAgentBridge.ts';
import { createPrefabStore } from "../../src/core/prefabStore.ts";
import { createPrefabHistory } from '../../src/core/prefabHistory.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import Transform from '../../src/runtime/components/TransformComponent.tsx';

registerComponent(Transform);
registerComponent({
    name: 'AgentFixture',
    properties: { enabled: { type: 'boolean', default: true } },
});

function fixture() {
    const store = createPrefabStore({ root: { id: 'root', children: [
        { id: 'alpha', name: 'Alpha wall', components: {
            custom: { type: 'AgentFixture', properties: { enabled: false } },
            transform: { type: 'Transform', properties: { position: [1, 0, 0] } },
        } },
        { id: 'beta', name: 'Beta wall' },
    ] } });
    const history = createPrefabHistory(store);
    history.connect();
    const focused = [];
    const captures = [];
    const host = {
        mode: () => 'edit',
        selectedId: () => null,
        transaction: history.transaction,
        beforeCommit() {},
        undo: history.undo,
        redo: history.redo,
        history: history.getSnapshot,
        focusNode: id => focused.push(id),
        captureView: async options => {
            captures.push(options);
            return { mimeType: 'image/png', dataUrl: 'data:image/png;base64,fixture', width: 1, height: 1 };
        },
        canSave: () => false,
        save: async () => {},
    };
    const service = createSceneAgent(store, () => host);
    return { store, service, scene: service.scene, focused, captures };
}

test('the normal find, look, update, capture and undo loop works', async () => {
    const { scene, store, focused, captures } = fixture();

    assert.equal(scene.info().nodeCount, 3);
    assert.deepEqual(Object.keys(scene.help().methods).sort(), Object.keys(scene).sort());

    const found = scene.find({ query: 'Alpha' }).node;
    assert.equal(found.id, 'alpha');
    assert.deepEqual(found.world.position, [1, 0, 0]);
    assert.equal(scene.search({ query: 'wall' }).total, 2);

    const full = scene.get({ id: found.id, resolved: true }).node;
    assert.equal(full.resolvedComponents.custom.properties.enabled, false);

    scene.look({ id: found.id });
    scene.update({
        id: found.id,
        patch: { name: 'Placed wall' },
        transform: { position: [4, 5, 6] },
        components: { custom: { properties: { enabled: true } } },
    });
    const image = await scene.capture({ mode: 'wireframe', fov: 42, position: [8, 6, 4], target: [0, 1, 0] });

    assert.deepEqual(focused, ['alpha']);
    assert.equal(image.mimeType, 'image/png');
    assert.deepEqual(captures, [{ mode: 'wireframe', fov: 42, position: [8, 6, 4], target: [0, 1, 0] }]);
    assert.deepEqual(image.capture, captures[0]);
    await assert.rejects(scene.capture({ mode: 'xray' }), /default, unlit or wireframe/);
    assert.equal(scene.info().saveMethod, 'exportJSON');
    assert.equal(JSON.parse(scene.exportJSON()).root.children[0].name, 'Placed wall');
    assert.equal(store.getState().nodesById.alpha.name, 'Placed wall');
    assert.deepEqual(store.getState().nodesById.alpha.components.transform.properties.position, [4, 5, 6]);
    assert.equal(store.getState().nodesById.alpha.components.custom.properties.enabled, true);

    scene.undo();
    assert.equal(store.getState().nodesById.alpha.name, 'Alpha wall');
});

test('the page exposes one directly discoverable scene editor', () => {
    const first = fixture();
    const second = fixture();
    const target = {};

    const cleanup = exposeSceneAgent(target, first.scene);
    assert.deepEqual(Object.keys(target), ['scene']);
    assert.equal(target.scene, first.scene);
    assert.throws(() => exposeSceneAgent(target, second.scene), /Only one/);

    cleanup();
    assert.equal(target.scene, undefined);
});

test('pack preserves placement, snapshots materials, survives JSON, duplicates and unpacks atomically', async () => {
    registerComponent({ name: 'PrefabRef', properties: { url: { type: 'string', default: '' } } });
    registerComponent({ name: 'Material', properties: { materialId: { type: 'string', default: '' } } });
    const original = { materials: { brass: { color: '#aa8822' } }, root: { id: 'world', children: [
        { id: 'assembly', name: 'Étagère', hidden: true, components: {
            pose: { type: 'Transform', properties: { position: [5, 6, 7], rotation: [0, .4, 0], scale: [2, 3, 4] } },
            custom: { type: 'AgentFixture', properties: { enabled: false } },
        }, children: [{ id: 'leg', components: {
            transform: { type: 'Transform', properties: { position: [1, 2, 3] } },
            material: { type: 'Material', properties: { materialId: 'brass' } },
        } }] },
    ] } };
    const store = createPrefabStore(original);
    const history = createPrefabHistory(store); history.connect();
    const host = { mode: () => 'edit', selectedId: () => null, transaction: history.transaction,
        beforeCommit() {}, undo: history.undo, redo: history.redo, history: history.getSnapshot,
        canSave: () => false, loadPrefab: async url => (await fetch(url)).json() };
    const { scene } = createSceneAgent(store, () => host);
    const exported = scene.exportPrefab({ id: 'assembly' }).prefab;
    assert.equal(exported.root.components.pose, undefined);
    assert.equal(exported.root.hidden, undefined);
    assert.deepEqual(exported.root.children[0].components.transform.properties.position, [1, 2, 3]);
    const revision = scene.info().revision;
    assert.throws(() => scene.pack({ id: 'world' }), /scene root/);
    scene.pack({ id: 'assembly', expectedRevision: revision });
    const packed = scene.get({ id: 'assembly' }).node;
    assert.deepEqual(packed.components.pose, original.root.children[0].components.pose);
    assert.equal(packed.hidden, true);
    assert.equal(packed.childCount, 0);
    const asset = await (await fetch(packed.components.prefabref.properties.url)).json();
    assert.equal(asset.name, 'Étagère');
    assert.equal(asset.materials.brass.color, '#aa8822');
    assert.equal(asset.root.components.custom.properties.enabled, false);
    assert.throws(() => scene.pack({ id: 'assembly' }), /already/);
    const roundtrip = JSON.parse(scene.exportJSON());
    assert.equal(roundtrip.root.children[0].components.prefabref.properties.url, packed.components.prefabref.properties.url);
    scene.duplicate({ id: 'assembly', newId: 'copy' });
    await scene.unpack({ id: 'copy' });
    const copy = scene.get({ id: 'copy', depth: 2 });
    assert.deepEqual(copy.node.components.pose, packed.components.pose);
    assert.equal(copy.node.components.prefabref, undefined);
    assert.equal(copy.descendants.length, 2);
    const child = copy.descendants.find(n => n.components.material);
    const materialId = child.components.material.properties.materialId;
    assert.equal(scene.materials({ ids: [materialId] }).materials[0].color, '#aa8822');
    assert.equal(scene.get({ id: 'assembly' }).node.childCount, 0);
    scene.undo();
    assert.ok(scene.get({ id: 'copy' }).node.components.prefabref);
    assert.throws(() => scene.materials({ ids: [materialId] }), /does not exist/);
    scene.undo(); // duplicate
    scene.undo(); // pack
    assert.deepEqual(scene.export().prefab.root, original.root);
});

test('unpack rejects stale async loads and keeps the original document', async () => {
    const { store } = fixture();
    let finish;
    const host = { mode: () => 'edit', loadPrefab: () => new Promise(resolve => { finish = resolve; }) };
    store.getState().replacePrefab({ root: { id: 'root', children: [{ id: 'ref', components: {
        ref: { type: 'PrefabRef', properties: { url: '/sample.json' } },
    } }] } });
    const { scene } = createSceneAgent(store, () => host);
    const pending = scene.unpack({ id: 'ref' });
    store.getState().replacePrefab({ root: { id: 'new-scene' } });
    finish({ root: { id: 'asset' } });
    await assert.rejects(pending, /revision conflict/);
    assert.equal(scene.export().prefab.root.id, 'new-scene');
});

test('bounds returns world measurements without editing and reports unavailable hosts', () => {
    const { store, scene } = fixture();
    assert.throws(() => scene.bounds({ id: 'alpha' }), /not configured/);
    const agent = createSceneAgent(store, () => ({ getBounds: () => ({ min: [0,-2,0], max: [2,-1,2], size: [2,1,2], center: [1,-1.5,1] }) })).scene;
    const result = agent.bounds({ id: 'alpha' });
    assert.equal(result.space, 'world');
    assert.equal(result.bounds.max[1], -1);
    assert.throws(() => agent.bounds({ id: 'missing' }), /does not exist/);
});

test('unpack preserves placement siblings and rejects failed or invalid assets without partial edits', async () => {
    const { store } = fixture();
    store.getState().replacePrefab({ root: { id: 'root', children: [{ id: 'ref', components: {
        pose: { type: 'Transform', properties: { position: [9,2,3], scale: [2,3,4] } },
        ref: { type: 'PrefabRef', properties: { url: '/sample.json' } },
        custom: { type: 'AgentFixture', properties: { enabled: false } },
    }, children: [{ id: 'attachment' }] }] } });
    const history = createPrefabHistory(store); history.connect();
    let fail = 'network';
    const host = { mode: () => 'edit', selectedId: () => null, canSave: () => false, transaction: history.transaction, beforeCommit() {},
        history: history.getSnapshot, undo: history.undo, redo: history.redo,
        loadPrefab: async () => {
            if (fail === 'network') throw new Error('Network error');
            return { materials: { unique: { color: '#123456' } }, root: { id: 'asset', components: {
                t: { type: fail === 'schema' ? 'UnknownComponent' : 'Transform', properties: { rotation: [0,0,.5] } },
            } } };
        } };
    const { scene } = createSceneAgent(store, () => host);
    const before = scene.exportJSON();
    await assert.rejects(scene.unpack({ id: 'ref' }), /Network error/);
    assert.equal(scene.exportJSON(), before);
    fail = 'schema';
    await assert.rejects(scene.unpack({ id: 'ref' }), /Unknown component/);
    assert.equal(scene.exportJSON(), before);
    fail = '';
    await scene.unpack({ id: 'ref' });
    const node = scene.get({ id: 'ref', depth: 1 });
    assert.deepEqual(node.node.components.pose.properties.scale, [2,3,4]);
    assert.equal(node.node.components.custom.properties.enabled, false);
    assert.equal(node.node.childCount, 2);
    assert.equal(node.descendants[1].id, 'attachment');
    assert.deepEqual(node.descendants[0].components.t.properties.rotation, [0,0,.5]);
    scene.undo();
    assert.equal(scene.exportJSON(), before);
});

test('group discovery filters before pagination and recursive search stays inside its subtree', () => {
    const { store, scene } = fixture();
    store.getState().replacePrefab({ root: { id: 'root', children: [
        { id: 'leaf' }, { id: 'group', children: [{ id: 'nested', children: [{ id: 'tip' }] }] },
        { id: 'outside', children: [{ id: 'other' }] },
    ] } });
    assert.deepEqual(scene.search({ parentId: 'root', groupsOnly: true, limit: 1 }).nodes.map(n => n.id), ['group']);
    assert.equal(scene.search({ parentId: 'root', groupsOnly: true, limit: 1 }).total, 2);
    assert.deepEqual(scene.search({ parentId: 'group', recursive: true }).nodes.map(n => n.id), ['nested','tip']);
    assert.deepEqual(scene.search({ parentId: 'group', recursive: true, groupsOnly: true }).nodes.map(n => n.id), ['nested']);
});

test('packMany shares matching definitions without changing placements and rejects overlapping batches', () => {
    const { store, scene } = fixture();
    store.getState().replacePrefab({ root: { id: 'root', children: [
        { id: 'a', children: [{ id: 'part-a', name: 'First part' }] },
        { id: 'b', name: 'Second assembly', components: { t: { type: 'Transform', properties: { position: [5,0,0] } } }, children: [{ id: 'part-b', name: 'Other part' }] },
    ] } });
    const before = scene.exportJSON();
    assert.throws(() => scene.packMany({ ids: ['a','part-a'] }), /ancestor/);
    assert.throws(() => scene.packMany({ ids: ['a','a'] }), /unique/);
    assert.throws(() => scene.packMany({ ids: ['a','missing'] }), /does not exist/);
    assert.equal(scene.exportJSON(), before);
    const result = scene.packMany({ ids: ['a','b'], reuse: true });
    assert.deepEqual(result.reused, [{ id: 'b', sourceId: 'a' }]);
    assert.equal(scene.get({ id: 'a' }).node.components.prefabref.properties.url, scene.get({ id: 'b' }).node.components.prefabref.properties.url);
    assert.deepEqual(scene.find({ query: 'Second assembly' }).node.local.position, [5,0,0]);
    scene.undo();
    assert.equal(scene.exportJSON(), before);
});

test('API writes notify editor selectors immediately and undo/redo publish fresh nodes', () => {
    const { scene, store } = fixture();
    const seen = [];
    const unsubscribe = store.subscribe(state => state.nodesById.alpha, node => seen.push(node));
    const original = store.getState().nodesById.alpha;
    scene.update({ id: 'alpha', patch: { name: 'Live rename' }, transform: { position: [8, 2, 1] } });
    assert.equal(seen.length, 1, 'a multi-command edit publishes one coherent node');
    assert.notEqual(seen[0], original);
    assert.equal(seen[0].name, 'Live rename');
    assert.deepEqual(seen[0].components.transform.properties.position, [8, 2, 1]);
    scene.undo();
    assert.equal(seen.length, 2);
    assert.equal(seen[1].name, 'Alpha wall');
    scene.redo();
    assert.equal(seen.length, 3);
    assert.equal(seen[2].name, 'Live rename');
    scene.remove({ id: 'alpha' });
    assert.equal(seen.length, 4);
    assert.equal(seen[3], undefined, 'selected-node deletion reaches the inspector subscription');
    unsubscribe();
});


test('clean capture passes helper visibility through without changing edit mode or document', async () => {
    const {scene,captures}=fixture();
    const before=scene.exportJSON();
    await scene.capture({helpers:false});
    assert.deepEqual(captures,[{helpers:false,mode:'default'}]);
    assert.equal(scene.info().mode,'edit');
    assert.equal(scene.exportJSON(),before);
    await assert.rejects(scene.capture({helpers:'false'}),/helpers must be boolean/);
});
