#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { evaluateSceneCommands } from './core/sceneCommands.js';
import { describeSceneComponents } from './core/componentSchemas.js';
import { sceneCommandBatchSchema } from './core/sceneCommandSchema.js';

const usage = `Usage:
  rtg convert <input.json|input.glb> <output.glb|output.json> [asset-root]
  rtg apply <scene.json> <commands.json> <output.json>
  rtg validate <scene.json> <commands.json>
  rtg components [component-name ...]
  rtg schema

commands.json: { "commands": [...] }; same operations as the editor scene.batch().`;
const json = (value: unknown) => JSON.stringify(value, null, 2);
async function readJSON(path: string) {
    const text = await readFile(resolve(path), 'utf8');
    try { return JSON.parse(text); }
    catch (error) { throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`); }
}
async function write(path: string, data: string | Uint8Array) {
    const output = resolve(path);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, data);
    console.log(output);
}
async function main() {
    const args = process.argv.slice(2);
    if (!args.length || args.includes('--help') || args.includes('-h')) {
        console.log(usage);
        return;
    }
    const operation = ['convert', 'apply', 'validate', 'components', 'schema'].includes(args[0])
        ? args.shift() : undefined;
    if (!operation) throw new Error(`Unknown command "${args[0]}". Run rtg --help.`);
    if (operation === 'schema') {
        if (args.length) throw new Error(usage);
        console.log(json(sceneCommandBatchSchema));
        return;
    }
    if (operation === 'components' || operation === 'apply' || operation === 'validate') {
        const { registerBuiltInComponents } = await import('./runtime/components/index.js');
        registerBuiltInComponents();
        if (operation === 'components') {
            console.log(json(describeSceneComponents(args.length ? { names: args } : {})));
            return;
        }
        if (args.length !== (operation === 'apply' ? 3 : 2)) throw new Error(usage);
        const evaluated = evaluateSceneCommands(await readJSON(args[0]), await readJSON(args[1]));
        if (operation === 'apply') await write(args[2], json(evaluated.prefab));
        else console.log(json(evaluated.result));
        return;
    }
    if (args.length < 2 || args.length > 3) throw new Error(usage);
    const [input, output] = args.slice(0, 2).map(path => resolve(path));
    const from = extname(input).toLowerCase(), to = extname(output).toLowerCase();
    if (!((from === '.json' && to === '.glb') || (from === '.glb' && to === '.json'))) {
        throw new Error('Supported conversions: .json → .glb and .glb → .json');
    }
    const { convert } = await import('./node.js');
    const result = from === '.json'
        ? new Uint8Array(await convert(await readJSON(input), { from: 'scene', to: 'glb', assetRoot: args[2] }))
        : json(await convert(await readFile(input), { from: 'glb', to: 'scene' }));
    await write(output, result);
}
main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
