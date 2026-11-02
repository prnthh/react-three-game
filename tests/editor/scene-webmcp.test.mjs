import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneAgent } from '../../src/editor/agent/sceneAgent.ts';
import { createSceneTools } from '../../src/editor/agent/sceneTools.ts';
import { exposeSceneAgent } from '../../src/editor/agent/sceneAgentBridge.ts';
import { getSceneWebMCPStatus, registerSceneWebMCP } from '../../src/editor/agent/sceneWebMCP.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { createPrefabHistory } from '../../src/core/prefabHistory.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import Transform from '../../src/runtime/components/TransformComponent.tsx';

registerComponent(Transform);
function fixture(overrides = {}) {
    const store = createPrefabStore({ name: 'WebMCP test scene', root: { id: 'root', children: [{ id: 'wall', name: 'Concrete wall', components: {
        transform: { type: 'Transform', properties: { position: [1, 0, 0] } },
    } }] } });
    const history = createPrefabHistory(store); history.connect();
    let mode = 'edit', selection = null;
    const service = createSceneAgent(store, () => ({
        mode: () => mode, setMode: value => { mode = value; }, selectedId: () => selection, setSelection: id => { selection = id; },
        transaction: history.transaction, beforeCommit() {}, undo: history.undo, redo: history.redo,
        history: history.getSnapshot, canSave: () => false, save: async () => {},
        captureView: async () => ({ mimeType: 'image/png', dataUrl: 'data:image/png;base64,cG5n', width: 1, height: 1 }),
        focusNode() {}, ...overrides,
    }));
    const tools = createSceneTools(service.scene);
    return { store, service, scene: service.scene, tools,
        call: (name, args = {}, options) => tools.find(tool => tool.name === `scene_${name}`).execute(args, options) };
}
const text = result => JSON.parse(result.content.find(block => block.type === 'text').text);

test('WebMCP catalog delegates to the JS API and shares its undo history', async () => {
    const f = fixture();
    assert.equal(new Set(f.tools.map(t => t.name)).size, f.tools.length);
    assert.deepEqual(text(await f.call('info')), f.scene.info());
    assert.equal(text(await f.call('search', { query: 'concrete' })).nodes[0].id, 'wall');
    const result = await f.call('update', { id: 'wall', transform: { position: [7, 2, 0] } });
    assert.ok(!result.isError);
    assert.deepEqual(f.scene.find({ query: 'wall' }).node.local.position, [7, 2, 0]);
    await f.call('history', { action: 'undo' });
    assert.deepEqual(f.scene.find({ query: 'wall' }).node.local.position, [1, 0, 0]);
    await f.call('history', { action: 'redo' });
    assert.deepEqual(f.scene.find({ query: 'wall' }).node.local.position, [7, 2, 0]);
    await f.call('mode', { mode: 'play' });
    assert.equal((await f.call('update', { id: 'wall', patch: { name: 'Cannot edit' } })).isError, true);
});

test('tool consumers cannot change another catalog or edit another editor', async () => {
    const first = fixture(), second = fixture();
    const update = first.tools.find(tool => tool.name === 'scene_update');
    update.inputSchema.required.push('consumerOnly');
    delete update.inputSchema.properties.id;
    const freshUpdate = createSceneTools(first.scene).find(tool => tool.name === 'scene_update');
    assert.ok(freshUpdate.inputSchema.properties.id);
    assert.ok(!freshUpdate.inputSchema.required.includes('consumerOnly'));
    assert.ok(!(await freshUpdate.execute({ id: 'wall', patch: { name: 'Edited' } })).isError);
    assert.equal(first.scene.get({ id: 'wall' }).node.name, 'Edited');
    assert.equal(second.scene.get({ id: 'wall' }).node.name, 'Concrete wall');
});

test('batch validation, revisions and input errors retain existing API protections', async () => {
    const f = fixture(), revision = f.scene.info().revision;
    const args = { expectedRevision: revision, commands: [{ op: 'remove', id: 'wall' }], validateOnly: true };
    assert.ok(!('isError' in await f.call('batch', args)));
    assert.equal(f.scene.info().nodeCount, 2);
    assert.equal((await f.call('batch', { ...args, validateOnly: 'true' })).isError, true);
    assert.equal((await f.call('info', { arbitrary: 'bad' })).isError, true);
    assert.equal((await f.call('get', { ids: 'wall' })).isError, true);
    await f.call('update', { id: 'wall', patch: { name: 'New name' } });
    assert.equal((await f.call('batch', { ...args, validateOnly: false })).isError, true);
    assert.equal(f.scene.info().nodeCount, 2);
    assert.equal((await f.call('history', { action: 'arbitrary_method' })).isError, true);
});

test('captures return native image blocks and canceled or disposed calls cannot start edits', async () => {
    const f = fixture();
    const image = await f.call('capture', {});
    assert.deepEqual(image.content[1], { type: 'image', mimeType: 'image/png', data: 'cG5n' });
    assert.ok(!image.content[0].text.includes('data:image'));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(f.call('update', { id: 'wall', patch: { name: 'bad' } }, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(f.scene.find({ query: 'wall' }).node.name, 'Concrete wall');
    f.service.dispose();
    assert.equal((await f.call('search')).isError, true);
});

function nativeContext(failAt = Infinity) {
    const tools = new Map(); let attempts = 0;
    return { tools, async registerTool(tool, { signal }) {
        if (++attempts === failAt) throw Error('Registration rejected');
        signal.throwIfAborted();
        if (tools.has(tool.name)) throw Error('Duplicate tool');
        tools.set(tool.name, tool);
        signal.addEventListener('abort', () => { if (tools.get(tool.name) === tool) tools.delete(tool.name); }, { once: true });
    } };
}

test('native document.modelContext registration and cleanup preserve unrelated page tools', async () => {
    let finish, requestSignal;
    const f = fixture({ loadPrefab: (_url, options) => { requestSignal = options.signal; return new Promise(resolve => { finish = resolve; }); } }), context = nativeContext();
    context.tools.set('unrelated', {});
    const registration = registerSceneWebMCP(f.scene, { modelContext: context });
    await registration.ready;
    assert.deepEqual(getSceneWebMCPStatus(f.scene), { state: 'ready', toolCount: f.tools.length });
    assert.deepEqual(text(await context.tools.get('scene_info').execute({})), f.scene.info());
    const stale = context.tools.get('scene_update');
    const loading = context.tools.get('scene_load').execute({ url: '/scene.json', expectedRevision: f.scene.info().revision });
    registration.dispose();
    assert.equal(requestSignal.aborted, true, 'unregistering native tools cancels their in-flight source load');
    finish({ root: { id: 'late' } });
    await assert.rejects(loading, { name: 'AbortError' });
    assert.deepEqual([...context.tools.keys()], ['unrelated']);
    await assert.rejects(stale.execute({ id: 'wall', patch: { name: 'bad' } }), { name: 'AbortError' });
    const again = registerSceneWebMCP(f.scene, { modelContext: context });
    await again.ready;
    assert.equal(context.tools.size, f.tools.length + 1); again.dispose();
});

test('registration failure rolls back partial tools; unsupported browsers retain the local panel catalog', async () => {
    const f = fixture(), context = nativeContext(3);
    const registration = registerSceneWebMCP(f.scene, { modelContext: context });
    await registration.ready;
    assert.equal(context.tools.size, 0);
    assert.equal(getSceneWebMCPStatus(f.scene).state, 'error');
    registration.dispose();
    const unsupported = registerSceneWebMCP(f.scene, {}); await unsupported.ready;
    assert.equal(getSceneWebMCPStatus(f.scene).state, 'unavailable');
    assert.equal(text(await f.call('info')).rootId, 'root'); unsupported.dispose();
});

test('the existing JS bridge owns native registration and supports immediate cleanup/remount', async () => {
    const f = fixture(), context = nativeContext();
    const target = { document: { modelContext: context } };
    const cleanup = exposeSceneAgent(target, f.scene);
    cleanup();
    const dispose = exposeSceneAgent(target, f.scene);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(context.tools.size, f.tools.length);
    assert.equal(target.scene, f.scene);
    dispose(); assert.equal(context.tools.size, 0); assert.equal(target.scene, undefined);
});

test('URL scene loading uses fresh data, validates, shares undo and exposes selection without UI', async () => {
    const next = { name: 'Loaded scene', root: { id: 'loaded', children: [{ id: 'part' }] } };
    const f = fixture({ loadPrefab: async (url, options) => {
        assert.equal(url, '/scene.json'); assert.equal(options.fresh, true); assert.ok(options.signal instanceof AbortSignal);
        return next;
    } });
    assert.equal((await f.call('load', { url: '/scene.json' })).isError, true, 'tool requires an explicit revision');
    const result = await f.call('load', { url: '/scene.json', expectedRevision: f.scene.info().revision });
    assert.ok(!result.isError); assert.equal(text(result).source, '/scene.json');
    assert.equal(text(result).nodeCount, 2); assert.equal(text(result).rootId, 'loaded');
    assert.equal(text(result).createdIds, undefined, 'loading a large scene returns a compact summary');
    assert.equal(f.scene.info().rootId, 'loaded');
    await f.call('view', { action: 'select', id: 'part' }); assert.equal(f.scene.info().selectedId, 'part');
    await f.call('view', { action: 'clearSelection' }); assert.equal(f.scene.info().selectedId, null);
    await f.call('history', { action: 'undo' }); assert.equal(f.scene.info().rootId, 'root');
    await f.call('history', { action: 'redo' }); assert.equal(f.scene.info().rootId, 'loaded');
    const invalid = fixture({ loadPrefab: async () => ({ root: { id: 7 } }) });
    await assert.rejects(invalid.scene.load({ url: '/bad.json' }));
    assert.equal(invalid.scene.info().rootId, 'root'); assert.equal(invalid.scene.info().canUndo, false);
});

test('late loads reject intervening edits, cancellation, mode changes and editor disposal', async () => {
    const next = { root: { id: 'loaded' } };
    let finish, signal;
    const f = fixture({ loadPrefab: (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); } });
    let pending = f.scene.load({ url: '/scene.json' });
    f.scene.update({ id: 'wall', patch: { name: 'Keep this edit' } }); finish(next);
    await assert.rejects(pending, /revision conflict/); assert.equal(f.scene.get({ id: 'wall' }).node.name, 'Keep this edit');
    const abort = new AbortController(); pending = f.scene.load({ url: '/scene.json' }, { signal: abort.signal });
    abort.abort(); finish(next); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(signal.aborted, true);
    const toolAbort = new AbortController();
    pending = f.call('load', { url: '/scene.json', expectedRevision: f.scene.info().revision }, { signal: toolAbort.signal });
    toolAbort.abort(); finish(next); await assert.rejects(pending, { name: 'AbortError' });
    pending = f.scene.load({ url: '/scene.json' }); await f.scene.setMode({ mode: 'play' }); finish(next);
    await assert.rejects(pending, /edit mode/); await f.scene.setMode({ mode: 'edit' });
    pending = f.scene.load({ url: '/scene.json' }); f.service.dispose(); assert.equal(signal.aborted, true);
    finish(next); await assert.rejects(pending, { name: 'AbortError' });
    f.service.activate(); pending = f.scene.load({ url: '/scene.json' }); assert.equal(signal.aborted, false);
    finish(next); await pending; assert.equal(f.scene.info().rootId, 'loaded');
});

test('tool discovery describes exactly the registered actions and its edit examples execute', async () => {
    const f = fixture();
    const guide = text(await f.call('info', { includeGuide: true })).guide;
    assert.deepEqual(Object.keys(guide.tools).sort(), f.tools.map(tool => tool.name).sort());
    for (const step of guide.workflow) {
        assert.ok(step.tools.length, `No callable route for: ${step.intent}`);
        for (const name of step.tools) assert.ok(f.tools.some(tool => tool.name === name), `Unknown route ${name}`);
    }
    for (const example of guide.examples) {
        const args = { ...example.arguments };
        if (args.id === '<node ID>') args.id = 'wall';
        if (args.names) args.names = ['Transform'];
        const result = await f.call(example.tool.slice('scene_'.length), args);
        assert.ok(!result.isError, `${example.tool}: ${JSON.stringify(result)}`);
    }
    assert.deepEqual(f.scene.find({ query: 'wall' }).node.local.position, [4, 2, 0]);
    await f.call('history', { action: 'undo' });
    assert.deepEqual(f.scene.find({ query: 'wall' }).node.local.position, [1, 0, 0]);
});
