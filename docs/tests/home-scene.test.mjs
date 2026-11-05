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
  const plan = await createSpatialPrefabPlan(prototype, runtime, { cellSize: 64, maxNodesPerChunk: 96 });
  assert.ok(plan.chunks.length > 0);
});
