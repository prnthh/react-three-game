import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement as h, useEffect } from 'react';
import { _roots } from '@react-three/fiber';
import { Box3, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHeadlessScene, exportPrefabToGLB } from '../../src/headless.tsx';
import { normalizePrefab } from '../../src/core/prefab.ts';
import { registerComponent } from '../../src/core/ComponentRegistry.ts';
import { useModelAsset } from '../../src/runtime/assets/AssetRuntime.tsx';
import { useAudioListener } from '../../src/runtime/audio/AudioRuntime.tsx';

const meshNode = (id, extra = {}) => ({ id, name: id, components: {
    mesh: { type: 'Mesh', properties: {} },
    geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 3, 4] } },
    material: { type: 'Material', properties: { materialId: 'paint' } },
    ...extra,
} });
const prefab = root => ({ root, materials: { paint: { color: '#806040', roughness: 0.6, metalness: 0.25 } } });
const meshes = scene => { const result = []; scene.traverse(object => { if (object.isMesh) result.push(object); }); return result; };
const bounds = scene => new Box3().setFromObject(scene);
function glbJSON(bytes) {
    const view = new DataView(bytes);
    assert.equal(view.getUint32(0, true), 0x46546c67);
    assert.equal(view.getUint32(4, true), 2);
    assert.equal(view.getUint32(8, true), bytes.byteLength);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, view.getUint32(12, true))));
}

test('docs skywalk exports and round-trips in Node without browser globals or duplicate instance batches', async () => {
    assert.equal(typeof window, 'undefined');
    assert.equal(typeof document, 'undefined');
    assert.equal(typeof AudioContext, 'undefined');
    assert.equal(typeof requestAnimationFrame, 'undefined');
    const rootsBefore = _roots.size;
    const data = JSON.parse(await readFile(new URL('../../docs/public/prefabs/brutalist-city/brutalist-skywalk.json', import.meta.url), 'utf8'));
    const host = await createHeadlessScene(data);
    try {
        assert.equal(meshes(host.scene).length, 37);
        assert.ok(meshes(host.scene).every(mesh => !mesh.isInstancedMesh && mesh.layers.mask === 1));
        const bytes = await host.exportGLB();
        const json = glbJSON(bytes);
        assert.equal(json.nodes.filter(node => node.mesh !== undefined).length, 37);
        assert.equal(json.materials.length, 3);
        const loaded = await new GLTFLoader().parseAsync(bytes, '');
        assert.equal(meshes(loaded.scene).length, 37);
        assert.ok(bounds(host.scene).min.distanceTo(bounds(loaded.scene).min) < 1e-5);
        assert.ok(bounds(host.scene).max.distanceTo(bounds(loaded.scene).max) < 1e-5);
        const expected = new Color(data.materials.material.color).toArray();
        assert.deepEqual(json.materials[0].pbrMetallicRoughness.baseColorFactor.slice(0, 3), expected);
    } finally { await host.dispose(); }
    await host.dispose();
    assert.equal(_roots.size, rootsBefore);
    await assert.rejects(host.exportGLB(), /disposed/);
    assert.equal(typeof window, 'undefined');
    assert.equal(typeof document, 'undefined');
});

test('static export preserves hierarchy and hidden state, skips audio and gameplay, and exports punctual lights', async () => {
    let soundLoads = 0;
    const audio = { type: 'Sound', properties: { clips: ['/never.mp3'], autoplay: true } };
    const script = { type: 'Runtime', properties: { setup: 'throw new Error("gameplay must not run")' } };
    let listener = 'not mounted';
    registerComponent({ name: 'HeadlessAudioProbe', renderWhenDisabled: true, properties: {}, View: ({ children }) => {
        listener = useAudioListener(); return children;
    } });
    const data = prefab({ id: 'root', components: {
        transform: { type: 'Transform', properties: { position: [10, 0, 0] } },
        audio, script, probe: { type: 'HeadlessAudioProbe', properties: {} },
    }, children: [
        meshNode('visible', { transform: { type: 'Transform', properties: { position: [2, 3, 4], scale: [-1, 2, 1] } } }),
        { ...meshNode('hidden'), hidden: true },
        { ...meshNode('disabled'), disabled: true },
        { id: 'light', components: { light: { type: 'PointLight', properties: { color: '#ff8000', intensity: 10 } } } },
    ] });
    const host = await createHeadlessScene(data, { loaders: { sound: async () => { soundLoads++; throw new Error('must not load'); } } });
    try {
        assert.equal(listener, undefined);
        assert.equal(soundLoads, 0);
        assert.equal(host.scene.getObjectByName('visible').matrixWorld.elements[12], 12);
        const json = glbJSON(await host.exportGLB());
        assert.equal(json.nodes.filter(node => node.mesh !== undefined).length, 1);
        assert.equal(json.extensions.KHR_lights_punctual.lights[0].type, 'point');
        assert.deepEqual(json.extensions.KHR_lights_punctual.lights[0].color, new Color('#ff8000').toArray());
    } finally { await host.dispose(); }
});

test('nested async prefabs and model loaders are isolated per host even for the same paths', async () => {
    const data = { root: { id: 'root', components: { child: { type: 'PrefabRef', properties: { url: '/shared.json' } } } } };
    const rootsBefore = _roots.size;
    const make = async label => {
        const source = new Group();
        source.name = label;
        source.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
        let loads = 0;
        const host = await createHeadlessScene(data, { basePath: '/assets', loaders: {
            prefab: async path => {
                assert.equal(path, '/assets/shared.json');
                await new Promise(resolve => setTimeout(resolve, 5));
                return normalizePrefab({ root: { id: 'nested', components: { model: { type: 'Model', properties: { filename: '/shared.glb' } } } } });
            },
            model: async path => { assert.equal(path, '/assets/shared.glb'); loads++; return source; },
        } });
        assert.equal(loads, 1);
        assert.ok(host.scene.getObjectByName(label));
        return host;
    };
    const [a, b] = await Promise.all([make('host-a'), make('host-b')]);
    try {
        assert.equal(a.scene.getObjectByName('host-b'), undefined);
        assert.equal(b.scene.getObjectByName('host-a'), undefined);
        const results = await Promise.all([a.exportGLB(), b.exportGLB()]);
        assert.ok(results.every(bytes => glbJSON(bytes).meshes.length === 1));
    } finally { await Promise.all([a.dispose(), b.dispose()]); }
    assert.equal(_roots.size, rootsBefore);
});

test('a render-time Suspense resource must commit before the host resolves', async () => {
    let committed = false;
    registerComponent({ name: 'HeadlessLateModel', renderWhenDisabled: true, properties: {}, View() {
        const model = useModelAsset('/late.glb');
        useEffect(() => { committed = true; }, []);
        return h('primitive', { object: model });
    } });
    const host = await createHeadlessScene({ root: { id: 'root', components: { model: { type: 'HeadlessLateModel', properties: {} } } } }, {
        loaders: { model: async () => { await new Promise(resolve => setTimeout(resolve, 10)); const group = new Group(); group.name = 'late'; return group; } },
    });
    try { assert.equal(committed, true); assert.ok(host.scene.getObjectByName('late')); }
    finally { await host.dispose(); }
});

test('unknown components, unsupported resources and cycles reject instead of producing partial exports', async () => {
    const rootsBefore = _roots.size;
    await assert.rejects(exportPrefabToGLB({ root: { id: 'root', components: { bad: { type: 'MissingHeadlessComponent', properties: {} } } } }), /Unknown component/);
    await assert.rejects(exportPrefabToGLB({ root: { id: 'root', components: { env: { type: 'Environment', properties: {} } } } }), /does not support Environment/);
    await assert.rejects(exportPrefabToGLB({ root: meshNode('root'), materials: { paint: { texture: '/image.png' } } }), /loaders.texture/);
    const cyclic = normalizePrefab({ root: { id: 'root', components: { ref: { type: 'PrefabRef', properties: { url: '/cycle.json' } } } } });
    await assert.rejects(createHeadlessScene({ root: { id: 'root', components: { ref: { type: 'PrefabRef', properties: { url: '/cycle.json' } } } } }, { loaders: { prefab: async () => cyclic } }), /Cyclic/);
    assert.equal(_roots.size, rootsBefore);
});

test('timeouts and cancellation clean up pending mounts; render failures reject and clean up', async t => {
    const rootsBefore = _roots.size;
    registerComponent({ name: 'HeadlessNeverReady', renderWhenDisabled: true, properties: {}, View() { throw new Promise(() => {}); } });
    await assert.rejects(createHeadlessScene({ root: { id: 'root', components: { wait: { type: 'HeadlessNeverReady', properties: {} } } } }, { timeoutMs: 30 }), /not ready/);
    assert.equal(_roots.size, rootsBefore);
    const abort = new AbortController();
    const pending = createHeadlessScene({ root: { id: 'root', components: { model: { type: 'Model', properties: { filename: '/pending.glb' } } } } }, {
        signal: abort.signal, loaders: { model: () => new Promise(() => {}) },
    });
    abort.abort(new Error('cancel conversion'));
    await assert.rejects(pending, /cancel conversion/);
    t.mock.method(console, 'error', () => {});
    registerComponent({ name: 'HeadlessBrokenView', renderWhenDisabled: true, properties: {}, View() { throw new Error('broken view'); } });
    await assert.rejects(createHeadlessScene({ root: { id: 'root', components: { broken: { type: 'HeadlessBrokenView', properties: {} } } } }), /broken view/);
    assert.equal(_roots.size, rootsBefore);
});
