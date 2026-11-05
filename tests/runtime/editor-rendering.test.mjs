import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h, useEffect } from 'react';
import { createRoot } from '@react-three/fiber';
import { NodeMountBudget, useNodeMountAdmission } from '../../src/runtime/prefabs/NodeMountBudget.tsx';
import { registerSceneCaptureRenderer, renderSceneCapture } from '../../src/runtime/rendering/sceneCapture.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('authoring mount budget admits only a bounded number each frame, cancels removals and preserves edits', async t => {
  const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
  const root = createRoot(canvas);
  await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
    size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
  t.after(async () => { await act(async () => root.unmount()); });
  const mounted = new Set();
  function Node({ id, enabled }) {
    const admitted = useNodeMountAdmission(enabled);
    useEffect(() => { if (admitted) { mounted.add(id); return () => mounted.delete(id); } }, [id, admitted]);
    return null;
  }
  let store;
  const render = (ids, enabled = true) => act(async () => { store = root.render(h(NodeMountBudget, { nodesPerFrame: 2 },
    ids.map(id => h(Node, { key: id, id, enabled })))); });
  await render(['a', 'b', 'removed', 'c', 'd']);
  assert.equal(mounted.size, 0);
  await act(async () => store.getState().advance(1, false));
  assert.deepEqual([...mounted], ['a', 'b']);
  await render(['a', 'b', 'c', 'd']);
  await act(async () => store.getState().advance(2, false));
  assert.deepEqual([...mounted], ['a', 'b', 'c', 'd']);
  await render(['a', 'b', 'c', 'd', 'play'], false);
  assert.ok(mounted.has('play'), 'Play bypasses the authoring budget so prefab preparation sees the complete tree');
});

test('captures await the host composition and dispose only their own registration', async () => {
  const calls = [];
  const renderer = { render() { calls.push('raw'); } };
  await renderSceneCapture(renderer, {}, {});
  assert.deepEqual(calls, ['raw']);
  const old = registerSceneCaptureRenderer(renderer, () => calls.push('old'));
  const latest = registerSceneCaptureRenderer(renderer, async () => { await Promise.resolve(); calls.push('composition'); });
  old();
  await renderSceneCapture(renderer, {}, {});
  assert.equal(calls.at(-1), 'composition');
  latest();
  await renderSceneCapture(renderer, {}, {});
  assert.equal(calls.at(-1), 'raw');
});

test('postprocessed frames and captures present to the screen without corrupting paused preparation state', async () => {
  const { renderToScreen } = await import('../../src/runtime/rendering/sceneCapture.ts');
  const preparationTarget = {}, preparationMRT = {};
  let target = preparationTarget, mrt = preparationMRT, draws = 0;
  const renderer = {
    getRenderTarget: () => target, setRenderTarget: value => { target = value; },
    getMRT: () => mrt, setMRT: value => { mrt = value; },
  };
  const renderFrame = () => renderToScreen(renderer, () => {
    assert.equal(target, null); assert.equal(mrt, null); draws++;
  });
  renderFrame();
  assert.equal(target, preparationTarget); assert.equal(mrt, preparationMRT);
  const dispose = registerSceneCaptureRenderer(renderer, renderFrame);
  try {
    await renderSceneCapture(renderer, {}, {});
    assert.equal(draws, 2);
    assert.equal(target, preparationTarget); assert.equal(mrt, preparationMRT);
    assert.throws(() => renderToScreen(renderer, () => { throw Error('pipeline failed'); }), /pipeline failed/);
    assert.equal(target, preparationTarget); assert.equal(mrt, preparationMRT);
  } finally { dispose(); }
});

test('concurrent capture overrides restore the authored view and a failed capture does not block later requests', async () => {
  const { withSceneCapture } = await import('../../src/runtime/rendering/sceneCapture.ts');
  const renderer = {}, events = [];
  let view = 'original', release, started;
  const begun = new Promise(resolve => { started = resolve; });
  const first = withSceneCapture(renderer, async () => {
    const before = view; view = 'first'; events.push('first'); started();
    try { await new Promise(resolve => { release = resolve; }); throw Error('capture failed'); }
    finally { view = before; }
  });
  const failure = assert.rejects(first, /capture failed/);
  await begun;
  const second = withSceneCapture(renderer, async () => {
    assert.equal(view, 'original', 'snapshot the restored view rather than another request’s override');
    const before = view; view = 'second'; events.push('second');
    try { await Promise.resolve(); return 'image'; }
    finally { view = before; }
  });
  const independent = await withSceneCapture({}, async () => 'another renderer');
  assert.equal(independent, 'another renderer');
  assert.deepEqual(events, ['first']);
  release(); await failure;
  assert.equal(await second, 'image');
  assert.deepEqual(events, ['first', 'second']);
  assert.equal(view, 'original');
});

test('combined node/children subscriptions follow edits and deletion without unrelated renders', async t => {
  const { createPrefabStore } = await import('../../src/core/prefabStore.ts');
  const { PrefabStoreProvider, usePrefabRenderNode } = await import('../../src/runtime/prefabs/PrefabStoreContext.ts');
  const store = createPrefabStore({ root: { id: 'root', children: [{ id: 'target' }, { id: 'other' }] } });
  let subscriptions = 0;
  const subscribe = store.subscribe;
  store.subscribe = (...args) => { subscriptions++; return subscribe(...args); };
  const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {} };
  const root = createRoot(canvas);
  await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas },
    size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never' });
  t.after(async () => { await act(async () => root.unmount()); });
  const snapshots = [];
  function Row() { snapshots.push(usePrefabRenderNode('target')); return null; }
  await act(async () => { root.render(h(PrefabStoreProvider, { store }, h(Row))); });
  assert.equal(subscriptions, 1);
  const initialRenders = snapshots.length;
  await act(async () => store.getState().updateNode('other', node => ({ ...node, name: 'unrelated' })));
  assert.equal(snapshots.length, initialRenders);
  await act(async () => store.getState().updateNode('target', node => ({ ...node, name: 'renamed' })));
  assert.equal(snapshots.at(-1)[0].name, 'renamed');
  await act(async () => store.getState().addChild('target', { id: 'child' }));
  assert.deepEqual(snapshots.at(-1)[1], ['child']);
  await act(async () => store.getState().deleteNode('child'));
  assert.deepEqual(snapshots.at(-1)[1], []);
  await act(async () => store.getState().deleteNode('target'));
  assert.deepEqual(snapshots.at(-1), [null, []]);
  const deletedRenders = snapshots.length;
  await act(async () => store.getState().updateNode('other', node => ({ ...node, name: 'still unrelated' })));
  assert.equal(snapshots.length, deletedRenders, 'the empty-child fallback remains stable');
  assert.equal(subscriptions, 1);
});
