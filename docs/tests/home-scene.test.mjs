import test from 'node:test';
import PrefabGridStreamerComponent from '../app/components/PrefabGridStreamerComponent.tsx';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrefab, denormalizePrefab } from '../../src/core/prefab.ts';
import { getComponent, registerComponent } from '../../src/core/ComponentRegistry.ts';
import { registerBuiltInComponents } from '../../src/runtime/components/index.ts';
import { preparePrefab } from '../../src/runtime/prefabs/preparePrefab.ts';
import { createSpatialPrefabPlan } from '../../src/runtime/prefabs/spatialPrefabPlan.ts';

test('home document carries reusable definitions and executable script source without another scene fetch', async () => {
  registerBuiltInComponents();
  assert.equal(getComponent('PrefabGridStreamer'), undefined, 'the repeating-world policy requires host registration');
  registerComponent(PrefabGridStreamerComponent);
  const prefab = JSON.parse(readFileSync(new URL('../public/prefabs/brutalist-city/game-level.json', import.meta.url)));
  const document = normalizePrefab(prefab);
  assert.equal(document.nodesById.root.components.renderSettings.type, 'RenderSettings');
  assert.equal(document.nodesById.root.components.postProcessing.type, 'PostProcessing');
  assert.equal(document.nodesById.root.components.chunkSettings.type, 'ChunkSettings');
  assert.equal(document.nodesById['home-sky'].components.sky.type, 'Sky');
  assert.equal(document.nodesById['home-diffuse-probe'].components.probe.type, 'DiffuseLightProbe');
  const streamer = document.nodesById['prefab-grid-streamer'].components.prefabGridStreamer.properties;
  assert.equal(streamer.url, undefined);
  assert.equal(streamer.prefabId, 'city-chunk-root');
  const runtime = { getComponent, loadDocument: async path => { throw Error(`Unexpected scene fetch: ${path}`); },
    loadModel: async () => {}, loadTexture: async () => {}, loadSound: async () => {}, getPrefab: () => null };
  await preparePrefab(runtime, document);
  const camera = Object.values(document.nodesById).find(n => n.components?.flythrough);
  const source = camera.components.flythrough.properties.update;
  const object = { position: { z: 40 } };
  new Function('object', 'data', 'delta', source)(object, { speed: 2.6 }, 0.5);
  assert.equal(object.position.z, 38.7);
  const restored = normalizePrefab(JSON.parse(JSON.stringify(denormalizePrefab(document))));
  assert.equal(restored.nodesById[camera.id].components.flythrough.properties.update, source);
  const prototype = normalizePrefab(restored.prefabs[streamer.prefabId], restored.prefabs);
  for (const side of ['west', 'east']) {
    const frontage = prototype.childIdsById[`city-${side}-frontage`];
    assert.equal(frontage.filter(id => id.startsWith(`city-${side}-block-`)).length, 8);
  }
  assert.equal(prototype.childIdsById['city-skybridges'].length, 4);
  for (const [variant, floors] of [[1, 13], [2, 17], [3, 11]]) {
    const habitat = restored.prefabs[`habitat-${variant}-root`].root;
    assert.equal(habitat.children.filter(node => node.id.startsWith(`habitat-${variant}-floor-`)).length, floors);
  }
  const paletteNodes = new Set(prototype.childIdsById['home-city-materials']);
  const materialNodes = Object.values(prototype.nodesById).filter(node => node.components?.material);
  for (const node of materialNodes) {
    const { name, ...settings } = node.components.material.properties;
    assert.ok(Object.hasOwn(prototype.materials, name), `Missing material definition for ${name}`);
    assert.equal(Object.keys(settings).length > 0, paletteNodes.has(node.id));
  }
  assert.equal(paletteNodes.size, Object.keys(prototype.materials).length);
  for (const side of ['east', 'west']) {
    const kit = `street-luminaire-${side}-kit`;
    assert.equal(restored.prefabs[kit].root.children.length, 4);
    assert.equal(Object.values(prototype.nodesById).filter(node => node.components?.prefab?.properties.prefabId === kit).length, 7);
  }
  const plan = await createSpatialPrefabPlan(prototype, runtime, { cellSize: 64, maxNodesPerChunk: 96 });
  assert.ok(plan.chunks.length > 0);
  assert.deepEqual(Object.fromEntries(plan.materials), prototype.materials);
  const batched = await createSpatialPrefabPlan(prototype, { ...runtime, batchPrimitives: true }, { cellSize: 64, maxNodesPerChunk: 96 });
  const geometryCount = cells => cells.reduce((count, cell) => count + Object.values(cell.document.nodesById)
    .filter(node => Object.values(node.components ?? {}).some(entry => entry?.type === 'Geometry')).length, 0);
  const instanceCount = batched.chunks.flatMap(cell => cell.batches ?? [])
    .reduce((count, batch) => count + batch.matrices.length / 16, 0);
  assert.ok(instanceCount > 0);
  assert.equal(geometryCount(batched.chunks) + instanceCount, geometryCount(plan.chunks));
  assert.deepEqual(batched.chunks.map(cell => cell.bounds), plan.chunks.map(cell => cell.bounds));
});
