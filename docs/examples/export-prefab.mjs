import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHeadlessScene } from 'react-three-game/headless';

const sample = fileURLToPath(new URL('../public/prefabs/brutalist-city/brutalist-skywalk.json', import.meta.url));
const source = resolve(process.argv[2] ?? sample);
const output = resolve(process.argv[3] ?? fileURLToPath(new URL('../output/headless/brutalist-skywalk.glb', import.meta.url)));
const prefab = JSON.parse(await readFile(source, 'utf8'));
const host = await createHeadlessScene(prefab);
try {
    let meshes = 0;
    host.scene.traverse(object => { if (object.isMesh) meshes++; });
    const bytes = await host.exportGLB();
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, new Uint8Array(bytes));
    console.log(`Exported ${meshes} meshes from ${source}\n${output} (${bytes.byteLength} bytes)`);
} finally {
    await host.dispose();
}
