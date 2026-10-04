import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { Box3, Color } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { convert } from '../../src/node.ts';
import { createHeadlessScene } from '../../src/headless.tsx';

const prefab = { root: {
    id: 'box', name: 'Box', components: {
        transform: { type: 'Transform', properties: { position: [3, 4, 5] } },
        geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 4, 6] } },
        material: { type: 'Material', properties: { name: 'paint', color: '#806040', roughness: 0.6 } },
    },
} };
const meshes = scene => { const found = []; scene.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
const parse = bytes => new GLTFLoader().parseAsync(bytes, '');

function checkScene(scene) {
    const [mesh] = meshes(scene);
    assert.equal(meshes(scene).length, 1);
    assert.ok(mesh.material.color.equals(new Color('#806040')));
    assert.equal(mesh.material.roughness, 0.6);
    const bounds = new Box3().setFromObject(scene);
    assert.deepEqual(bounds.min.toArray(), [2, 2, 2]);
    assert.deepEqual(bounds.max.toArray(), [4, 6, 8]);
}

test('Node conversion and the CLI round-trip scene JSON and GLB', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'rtg-conversion-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const cli = (...args) => promisify(execFile)(process.execPath, [
        '--import', fileURLToPath(new URL('../support/register.mjs', import.meta.url)),
        fileURLToPath(new URL('../../src/cli.ts', import.meta.url)), ...args,
    ]);
    const before = structuredClone(prefab);
    const bytes = await convert(prefab, { from: 'scene', to: 'glb' });
    checkScene((await parse(bytes)).scene);
    const restored = await convert(bytes, { from: 'glb', to: 'scene' });
    checkScene((await parse(await convert(restored, { from: 'scene', to: 'glb' }))).scene);
    assert.deepEqual(prefab, before);

    const input = join(directory, 'scene.json'), glb = join(directory, 'scene.glb'), json = join(directory, 'restored.json');
    await writeFile(input, JSON.stringify(prefab));
    await cli('convert', input, glb);
    await cli('convert', glb, json);
    const output = JSON.parse(await readFile(json, 'utf8'));
    checkScene((await parse(await convert(output, { from: 'scene', to: 'glb' }))).scene);
    assert.deepEqual(JSON.parse(await readFile(input, 'utf8')), prefab);
    await assert.rejects(convert(Buffer.from('invalid'), { from: 'glb', to: 'scene' }));
});

test('the headless host builds and exports built-in geometry, material and transforms', async () => {
    const host = await createHeadlessScene(prefab);
    try {
        checkScene(host.scene);
        checkScene((await parse(await host.exportGLB())).scene);
    } finally { await host.dispose(); }
});
