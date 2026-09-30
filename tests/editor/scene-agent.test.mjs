import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneAgent } from '../../src/tools/prefabeditor/sceneAgent.ts';
import { exposeSceneAgent } from '../../src/tools/prefabeditor/sceneAgentBridge.ts';
import { createPrefabStore } from '../../src/tools/prefabeditor/prefabStore.ts';
import { createPrefabHistory } from '../../src/tools/prefabeditor/prefabHistory.ts';
import { registerComponent } from '../../src/tools/prefabeditor/components/ComponentRegistry.ts';
import Transform from '../../src/tools/prefabeditor/components/TransformComponent.tsx';
registerComponent(Transform);
registerComponent({ name: 'AgentFixture', description: 'Custom game component.', properties: {
    enabled: { type: 'boolean', default: true },
    count: { type: 'number', default: 2, min: 1, max: 20 },
    offsets: { type: 'number[]', default: props => Array(props.count).fill(1), description: 'One offset per copy.' },
    settings: { type: 'object', default: {}, schema: { type: 'object', properties: { color: { type: 'string' } } } },
} });
function fixture() {
    const store = createPrefabStore({ root: { id: 'root', children: [
        { id: 'a', name: 'Alpha', components: { custom: { type: 'AgentFixture', properties: { count: 3, enabled: false } } }, children: [{ id: 'leaf' }] },
        { id: 'b', name: 'Beta', components: { transform: { type: 'Transform', properties: { position: [1, 0, 0] } } } },
    ] } });
    const history = createPrefabHistory(store);
    const disconnect = history.connect();
    const host = { mode: () => 'edit', selectedId: () => 'a', transaction: history.transaction, beforeCommit() {}, undo: history.undo, redo: history.redo, history: history.getSnapshot,
        captureView: async () => ({ mimeType: 'image/png', dataUrl: 'data:image/png;base64,fixture', width: 1, height: 1 }), focusNode() {}, canSave: () => false, save: async () => {} };
    const service = createSceneAgent(store, () => host);
    const api = service.api;
    const batch = commands => ({ expectedRevision: api.getSceneInfo().revision, commands });
    return { store, history, host, service, api, batch, disconnect };
}

test('queries are bounded, targeted, include custom schemas and cannot mutate live data', () => {
    const { api, store } = fixture();
    assert.equal(api.findNodes({ component: 'AgentFixture' }).nodes[0].id, 'a');
    assert.deepEqual(api.findNodes({ parentId: 'root', limit: 1 }).nodes.map(n => n.id), ['a']);
    assert.equal(api.findNodes({ parentId: 'root', limit: 1 }).nextOffset, 1);
    assert.deepEqual(api.findNodes({ name: 'ALPHA' }).nodes.map(n => n.id), ['a']);
    const read = api.getNodes({ ids: ['a'], resolved: true, depth: 1 });
    assert.deepEqual(read.nodes.map(n => n.id), ['a', 'leaf']);
    assert.deepEqual(read.nodes[0].resolvedComponents.custom.properties.offsets, [1, 1, 1]);
    read.nodes[0].components.custom.properties.count = 999;
    assert.equal(store.getState().nodesById.a.components.custom.properties.count, 3);
    assert.equal(api.getNodes({ ids: ['root'], depth: 5, limit: 1 }).truncated, true);
    assert.throws(() => api.getNodes({ ids: ['absent'] }), /does not exist/);
    assert.throws(() => api.findNodes({ limit: 10000 }), /integer/);
    assert.throws(() => api.findNodes({ typo: 'x' }), /Unknown option/);
    const summary = api.describeComponents().components.find(c => c.name === 'AgentFixture');
    assert.equal(summary.schema, undefined);
    const component = api.describeComponents({ names: ['AgentFixture'], properties: { AgentFixture: { count: 4 } } }).components[0];
    assert.deepEqual(component.defaults.offsets, [1, 1, 1, 1]);
    assert.equal(component.schema.properties.offsets['x-dynamicDefault'], true);
    assert.equal(component.schema.properties.count.maximum, 20);
    assert.equal(component.schema.properties.settings.properties.color.type, 'string');
    component.defaults.count = 999;
    assert.equal(api.describeComponents({ names: ['AgentFixture'] }).components[0].defaults.count, 2);
});

test('batch commits once, preserves untouched references, and undo/redo isolate the transaction', () => {
    const { api, store, batch, history } = fixture();
    const untouched = store.getState().nodesById.b;
    const initialRevision = api.getSceneInfo().revision;
    store.getState().updateNode('root', n => ({ ...n, name: 'Human edit' }));
    const current = api.getSceneInfo().revision;
    assert.notEqual(initialRevision, current);
    let commits = 0;
    const off = store.subscribe(() => commits++);
    const input = batch([
        { op: 'patchComponent', id: 'a', key: 'custom', properties: { count: 8 } },
        { op: 'duplicate', id: 'a', newId: 'copy' },
        { op: 'transform', id: 'copy', position: [1, 2, 3] },
    ]);
    assert.equal(api.validateBatch(input).revision, current);
    assert.equal(commits, 0);
    const applied = api.applyBatch(input);
    assert.equal(commits, 1);
    assert.deepEqual(applied.createdIds, ['copy', 'copy/leaf']);
    assert.strictEqual(store.getState().nodesById.b, untouched);
    assert.equal(store.getState().nodesById.a.components.custom.properties.enabled, false);
    assert.equal(store.getState().nodesById.a.components.custom.properties.count, 8);
    assert.throws(() => api.applyBatch(input), /revision conflict/);
    const undone = api.undo({ expectedRevision: applied.revision });
    assert.equal(store.getState().nodesById.copy, undefined);
    assert.equal(store.getState().nodesById.a.components.custom.properties.count, 3);
    assert.equal(store.getState().nodesById.root.name, 'Human edit');
    api.validateBatch(batch([{ op: 'update', id: 'a', patch: { name: 'Validation only' } }]));
    assert.equal(api.getSceneInfo().canRedo, true);
    const redone = api.redo({ expectedRevision: undone.revision });
    assert.ok(store.getState().nodesById.copy);
    api.undo({ expectedRevision: redone.revision });
    history.undo();
    assert.equal(store.getState().nodesById.root.name, undefined);
    off();
});

test('failed commands, stale revisions and no-ops preserve scene and history', () => {
    const { api, store, batch, host } = fixture();
    const before = store.getState();
    const revision = api.getSceneInfo().revision;
    assert.throws(() => api.applyBatch(batch([
        { op: 'patchComponent', id: 'a', key: 'custom', properties: { count: 4 } },
        { op: 'remove', id: 'missing' },
    ])), /Command 2/);
    assert.strictEqual(store.getState(), before);
    assert.equal(api.getSceneInfo().revision, revision);
    assert.equal(api.applyBatch(batch([{ op: 'update', id: 'a', patch: { name: 'Alpha' } }])).changed, false);
    assert.equal(api.getSceneInfo().canUndo, false);
    assert.throws(() => api.applyBatch({ commands: [{ op: 'remove', id: 'a' }] }), /revision conflict/);
    host.mode = () => 'play';
    assert.throws(() => api.applyBatch(batch([{ op: 'remove', id: 'a' }])), /edit mode/);
});

test('patches preserve unspecified fields; unset restores defaults; material reads are isolated', () => {
    const { api, store, batch } = fixture();
    api.applyBatch(batch([
        { op: 'patchComponent', id: 'a', key: 'custom', properties: {}, unset: ['enabled'] },
        { op: 'material', id: 'paint', material: { color: '#f00', roughness: 0.2 } },
        { op: 'patchMaterial', id: 'paint', patch: { color: '#0f0' } },
    ]));
    assert.equal(api.getNodes({ ids: ['a'], resolved: true }).nodes[0].resolvedComponents.custom.properties.enabled, true);
    const material = api.getMaterials({ ids: ['paint'] }).materials[0];
    assert.equal(material.roughness, 0.2);
    material.color = 'mutated';
    assert.equal(store.getState().materials.paint.color, '#0f0');
    assert.throws(() => api.applyBatch(batch([{ op: 'patchComponent', id: 'a', key: 'custom', properties: { count: 4 }, unset: ['count'] }])), /Cannot patch and unset/);
});

test('bridge supports multiple editors, duplicate rejection, cleanup and stale references', () => {
    const first = fixture(), second = fixture();
    const target = {};
    const removeFirst = exposeSceneAgent(target, 'main', first.api);
    const removeSecond = exposeSceneAgent(target, 'other', second.api);
    assert.deepEqual(target.reactThreeGame.listEditors().map(e => e.id), ['main', 'other']);
    assert.throws(() => exposeSceneAgent(target, 'main', second.api), /already mounted/);
    assert.throws(() => exposeSceneAgent(target, '__proto__', second.api), /Agent editor ID/);
    removeFirst(); first.service.dispose();
    assert.throws(() => first.api.getSceneInfo(), /no longer mounted/);
    assert.ok(target.reactThreeGame.editors.other);
    removeSecond();
    assert.equal(target.reactThreeGame, undefined);
    first.service.activate();
    const cleanup = exposeSceneAgent(target, 'main', first.api);
    assert.ok(target.reactThreeGame.editors.main);
    cleanup();
});

test('capture and host persistence report exact snapshot revisions', async () => {
    const { api, host, store } = fixture();
    const revision = api.getSceneInfo().revision;
    assert.equal((await api.captureView()).revision, revision);
    await assert.rejects(() => api.saveScene({ expectedRevision: revision }), /No host save/);
    let saved;
    host.canSave = () => true;
    host.save = async prefab => { saved = prefab; store.getState().updateNode('a', n => ({ ...n, name: 'During save' })); };
    const result = await api.saveScene({ expectedRevision: revision });
    assert.equal(result.savedRevision, revision);
    assert.notEqual(result.currentRevision, revision);
    assert.equal(saved.root.children[0].name, 'Alpha');
    assert.equal(api.getNodes({ ids: ['a'] }).nodes[0].name, 'During save');
});

test('help covers the callable API, is read-only, and its example executes', async () => {
    const {api, store, service} = fixture();
    const before = store.getState();
    const revision = api.getSceneInfo().revision;
    const help = api.help();
    assert.deepEqual(Object.keys(help.methods).sort(), Object.keys(api).sort());
    help.rules.length = 0;
    assert.ok(api.help().rules.length > 0);
    assert.strictEqual(store.getState(), before);
    assert.equal(api.getSceneInfo().revision, revision);
    const runExample = new Function('api', `${help.example}; return renameNode('a', 'Renamed');`);
    const {result, image} = await runExample(api);
    assert.equal(store.getState().nodesById.a.name, 'Renamed');
    assert.equal(image.revision, result.revision);
    api.undo({expectedRevision: result.revision});
    assert.equal(store.getState().nodesById.a.name, 'Alpha');
    service.dispose();
    assert.throws(() => api.help(), /no longer mounted/);
});

test('registry help guides discovery without assuming a default editor', () => {
    const target = {};
    const {api} = fixture();
    const remove = exposeSceneAgent(target, 'jumper', api);
    const guide = target.reactThreeGame.help();
    assert.match(guide.start.join('\n'), /listEditors/);
    guide.start.length = 0;
    assert.ok(target.reactThreeGame.help().start.length > 0);
    assert.equal(target.reactThreeGame.listEditors()[0].id, 'jumper');
    remove();
    assert.equal(target.reactThreeGame, undefined);
});

test('window export methods request downloads in Edit or Play without changing document history', async () => {
    const { api, host, store, service } = fixture();
    const calls = [];
    host.exportGLB = async filename => { calls.push(['glb', filename]); };
    host.screenshot = async filename => { calls.push(['png', filename]); };
    const before = store.getState();
    const revision = api.getSceneInfo().revision;
    const glb = await api.exportGLB({ filename: 'warehouse.glb' });
    assert.deepEqual(glb, { downloadRequested: true, filename: 'warehouse.glb', mimeType: 'model/gltf-binary', revision, currentRevision: revision });
    host.mode = () => 'play';
    const png = await api.screenshot();
    assert.equal(png.filename, 'screenshot.png');
    assert.equal(png.mimeType, 'image/png');
    await api.exportGLB();
    await api.screenshot({ filename: 'review.png' });
    assert.deepEqual(calls, [['glb', 'warehouse.glb'], ['png', 'screenshot.png'], ['glb', 'scene.glb'], ['png', 'review.png']]);
    assert.strictEqual(store.getState(), before);
    assert.equal(api.getSceneInfo().canUndo, false);
    for (const input of [{ filename: '' }, { filename: '../scene.glb' }, { filename: 4 }, { typo: true }]) {
        await assert.rejects(api.exportGLB(input));
        await assert.rejects(api.screenshot(input));
    }
    assert.equal(calls.length, 4, 'invalid options never request a download');
    service.dispose();
    await assert.rejects(api.exportGLB(), /no longer mounted/);
    await assert.rejects(api.screenshot(), /no longer mounted/);
});

test('downloads report concurrent edits and propagate unsupported or failed exports', async () => {
    const { api, host, store } = fixture();
    await assert.rejects(api.exportGLB(), /not configured/);
    await assert.rejects(api.screenshot(), /not configured/);
    host.exportGLB = async () => { throw new Error('Export failed'); };
    host.screenshot = async () => { throw new Error('Canvas not ready'); };
    await assert.rejects(api.exportGLB(), /Export failed/);
    await assert.rejects(api.screenshot(), /Canvas not ready/);
    const revision = api.getSceneInfo().revision;
    host.exportGLB = async () => { store.getState().updateNode('a', node => ({ ...node, name: 'During export' })); };
    const result = await api.exportGLB();
    assert.equal(result.revision, revision);
    assert.notEqual(result.currentRevision, revision);
});

test('live mutations leave document exports and revisions unchanged; document edits share agent history', async () => {
    const { Group } = await import('three');
    const { createPrefabApi, createPrefabDocumentApi } = await import('../../src/tools/prefabeditor/prefabApi.ts');
    const { createPrefabRegistry } = await import('../../src/tools/prefabeditor/SceneContext.tsx');
    const { store, api, history, disconnect } = fixture();
    const registry = createPrefabRegistry();
    const live = new Group();
    registry.registerObject('b', live);
    const ref = createPrefabApi(store, registry, () => null, '');
    const document = createPrefabDocumentApi(store);
    const before = api.exportScene();
    ref.getObject('b').position.set(9, 8, 7);
    assert.deepEqual(api.exportScene(), before);
    assert.equal(document.getObject, undefined, 'document facade exposes no live objects');
    let publications = 0;
    store.subscribe(() => publications++);
    document.batch(() => {
        document.update('b', node => ({ ...node, name: 'Renamed' }));
        document.add({ id: 'new-child' }, 'b');
    });
    assert.equal(publications, 1);
    assert.notEqual(api.getSceneInfo().revision, before.revision);
    assert.equal(api.getNodes({ ids: ['b'] }).nodes[0].name, 'Renamed');
    assert.deepEqual(live.position.toArray(), [9, 8, 7]);
    history.undo();
    assert.equal(document.get('new-child'), null);
    assert.equal(document.get('b').name, 'Beta');
    assert.deepEqual(live.position.toArray(), [9, 8, 7]);
    disconnect();
});

test('replacement commands use the shared atomic edit and undo path', () => {
    const { api, store, batch } = fixture();
    const before = api.exportScene();
    assert.throws(() => api.applyBatch(batch([
        { op: 'replaceNode', id: 'a', node: { id: 'b' } },
    ])), /Duplicate node/);
    assert.deepEqual(api.exportScene(), before);
    let publications = 0;
    store.subscribe(() => publications++);
    api.applyBatch(batch([
        { op: 'replaceNode', id: 'a', node: { id: 'a', children: [{ id: 'replacement' }] } },
        { op: 'update', id: 'replacement', patch: { name: 'Replaced' } },
    ]));
    assert.equal(publications, 1);
    assert.equal(store.getState().nodesById.leaf, undefined);
    assert.equal(store.getState().nodesById.replacement.name, 'Replaced');
    api.undo({ expectedRevision: api.getSceneInfo().revision });
    assert.deepEqual(api.exportScene().prefab, before.prefab);
});

test('complete document replacement validates and remains undoable', () => {
    const { api, store, batch } = fixture();
    const before = api.exportScene();
    assert.throws(() => api.applyBatch(batch([
        { op: 'replace', prefab: { root: { id: 'new', children: [{ id: 'new' }] } } },
    ])), /Duplicate node/);
    assert.deepEqual(api.exportScene(), before);
    api.applyBatch(batch([
        { op: 'replace', prefab: { root: { id: 'new' }, materials: { paint: { color: '#fff' } } } },
    ]));
    assert.equal(store.getState().rootId, 'new');
    api.undo({ expectedRevision: api.getSceneInfo().revision });
    assert.deepEqual(api.exportScene().prefab, before.prefab);
});

test('mode, reset, selection and camera controls delegate without editing the document', async () => {
    const { api, host } = fixture();
    let mode = 'edit', resets = 0, selected = 'a';
    let view = { position: [3, 4, 5], target: [0, 0, 0] };
    host.mode = () => mode;
    host.setMode = value => { mode = value; };
    host.resetScene = () => { resets++; selected = null; };
    host.setSelection = value => { selected = value; };
    host.getView = () => view;
    host.setView = value => { view = value; };
    const before = api.exportScene();
    assert.deepEqual(await api.setMode({ mode: 'play' }), { mode: 'play' });
    assert.throws(() => api.setView(view), /edit mode/);
    await api.resetScene();
    assert.equal(resets, 1);
    assert.equal(mode, 'play');
    await api.setMode({ mode: 'edit' });
    api.setSelection({ id: 'b' });
    assert.equal(selected, 'b');
    api.setSelection({ id: null });
    assert.equal(selected, null);
    assert.throws(() => api.setSelection({ id: 'missing' }), /does not exist/);
    api.setView({ position: [8, 5, 8], target: [0, 1, 0] });
    const read = api.getView(); read.position[0] = 100;
    assert.equal(api.getView().position[0], 8);
    assert.throws(() => api.setView({ position: [0, NaN, 0], target: [1, 0, 0] }), /finite/);
    assert.throws(() => api.setView({ position: [0, 0, 0], target: [0, 0, 0] }), /differ/);
    await assert.rejects(api.setMode({ mode: 'unknown' }), /mode must/);
    assert.deepEqual(api.exportScene(), before);
});
