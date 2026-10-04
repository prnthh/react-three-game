import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateSceneCommands } from '../../src/core/sceneCommands.ts';

const cli = (...args) => execFileSync(process.execPath, ['--import', './tests/support/register.mjs', 'src/cli.ts', ...args], { encoding: 'utf8' });
test('CLI maps batches to core, validates without writes, and preserves output on failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rtg-commands-'));
    try {
        const input = join(dir, 'scene.json'), batch = join(dir, 'commands.json'), output = join(dir, 'out.json');
        const scene = { root: { id: 'root', children: [{ id: 'child' }] } };
        const commands = { commands: [{ op: 'update', id: 'child', patch: { name: 'Renamed' } }, { op: 'transform', id: 'child', position: [1, 2, 3] }] };
        writeFileSync(input, JSON.stringify(scene));
        writeFileSync(batch, JSON.stringify(commands));
        const expected = evaluateSceneCommands(scene, commands);
        assert.deepEqual(JSON.parse(cli('validate', input, batch)), expected.result);
        cli('apply', input, batch, output);
        assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), JSON.parse(JSON.stringify(expected.prefab)));
        assert.deepEqual(JSON.parse(readFileSync(input, 'utf8')), scene);
        const before = readFileSync(output, 'utf8');
        commands.commands.push({ op: 'remove', id: 'missing' });
        writeFileSync(batch, JSON.stringify(commands));
        const failed = spawnSync(process.execPath, ['--import', './tests/support/register.mjs', 'src/cli.ts', 'apply', input, batch, output], { encoding: 'utf8' });
        assert.equal(failed.status, 1);
        assert.match(failed.stderr, /Command 3.*does not exist/);
        assert.equal(readFileSync(output, 'utf8'), before);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('CLI exposes the shared command schema and registered component contracts', () => {
    const schema = JSON.parse(cli('schema'));
    assert.equal(schema.type, 'object');
    assert.deepEqual(schema.required, ['commands']);
    assert.equal(schema.properties.commands.type, 'array');
    assert.match(cli('components', 'Transform'), /position/);
    assert.match(cli('--help'), /rtg convert/);
});

test('CLI help and errors guide file-based use', () => {
    assert.match(cli(), /rtg apply/);
    assert.match(cli('apply', '--help'), /commands.json/);
    const run = (...args) => spawnSync(process.execPath, ['--import', './tests/support/register.mjs', 'src/cli.ts', ...args], { encoding: 'utf8' });
    const implicit = run('scene.json', 'scene.glb');
    assert.equal(implicit.status, 1);
    assert.match(implicit.stderr, /Unknown command/);
    const unknown = run('aply');
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown command "aply"/);
    const dir = mkdtempSync(join(tmpdir(), 'rtg-invalid-'));
    try {
        const file = join(dir, 'broken.json');
        writeFileSync(file, '{broken');
        const invalid = run('validate', file, file);
        assert.equal(invalid.status, 1);
        assert.ok(invalid.stderr.includes(`Invalid JSON in ${file}`));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
