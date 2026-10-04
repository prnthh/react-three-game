// Verify the distributable itself, without the source loader used by unit tests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');
const directory = mkdtempSync(join(tmpdir(), 'rtg-package-'));
const run = (command, args, cwd = directory) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
    const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--cache', join(directory, 'npm-cache'), '--pack-destination', directory], root));
    run('tar', ['-xzf', join(directory, packed.filename)]);
    const packageRoot = join(directory, 'package');
    // Reuse installed dependencies, but resolve react-three-game to the packed files.
    symlinkSync(join(root, 'node_modules'), join(packageRoot, 'node_modules'), 'dir');
    mkdirSync(join(directory, 'node_modules'));
    symlinkSync(packageRoot, join(directory, 'node_modules/react-three-game'), 'dir');
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.bin), ['rtg']);
    assert.match(run(process.execPath, [join(packageRoot, manifest.bin.rtg), '--help']), /rtg apply/);
    writeFileSync(join(directory, 'scene.json'), '{"root":{"id":"root"}}');
    writeFileSync(join(directory, 'commands.json'), '{"commands":[{"op":"update","id":"root","patch":{"name":"Packed"}}]}');
    run(process.execPath, [join(packageRoot, manifest.bin.rtg), 'apply', 'scene.json', 'commands.json', 'edited.json']);
    assert.equal(JSON.parse(readFileSync(join(directory, 'edited.json'), 'utf8')).root.name, 'Packed');
    assert.equal(run(process.execPath, ['--input-type=module', '-e', `
        import { evaluateSceneCommands } from 'react-three-game/core';
        import { convert, registerBuiltInComponents } from 'react-three-game/node';
        if (typeof evaluateSceneCommands !== 'function' || typeof convert !== 'function') throw new Error('Missing public API');
        registerBuiltInComponents();
        const { prefab } = evaluateSceneCommands({ root: { id: 'root' } }, { commands: [{
            op: 'add', parentId: 'root', node: { id: 'box', components: { geometry: { type: 'Geometry', properties: {} } } }
        }] });
        if (prefab.root.children[0].id !== 'box') throw new Error('Built-in contracts unavailable');
        console.log('ok');
    `]).trim(), 'ok');
    writeFileSync(join(directory, 'consumer.mts'), `
        import { evaluateSceneCommands, type Prefab, type SceneCommandBatch } from 'react-three-game/core';
        import { convert } from 'react-three-game/node';
        const input: Prefab = { root: { id: 'root' } };
        const batch: SceneCommandBatch = { commands: [{ op: 'update', id: 'root', patch: { name: 'Edited' } }] };
        const result: Prefab = evaluateSceneCommands(input, batch).prefab;
        const bytes: Promise<ArrayBuffer> = convert(result, { from: 'scene', to: 'glb' });
        // @ts-expect-error The published API must retain its concrete return type.
        const invalid: number = evaluateSceneCommands(input, batch).prefab;
    `);
    run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts']);
    console.log('Packed CLI, public imports, and NodeNext TypeScript consumer passed.');
} catch (error) {
    if (error.stdout) process.stderr.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
} finally {
    rmSync(directory, { recursive: true, force: true });
}
