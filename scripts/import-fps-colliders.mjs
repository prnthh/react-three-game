// Run after npm run build. Bake Blender collision markers into the shared scene JSON.
// The server reads serialized colliders; it never needs the render assets or a GPU.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadGLBScene, decomposeModelToPrefabNodes } from '../dist/core/index.js';
const root = new URL('../', import.meta.url);
const mapPath = new URL('docs/app/demo/fps/map.json', root);
const document = JSON.parse(await readFile(mapPath, 'utf8'));
const cache = new Map();
let count = 0;
function prune(node, prefix, data, path = '0') {
    const children = (node.children ?? []).map((child, i) => prune(child, prefix, data, `${path}-${i}`)).filter(Boolean);
    const collider = Object.values(node.components ?? {}).find(c => c.type === 'MeshCollider');
    if (!collider && !children.length) return null;
    return { id: `${prefix}-${path}`, name: node.name, components: {
        ...(node.components?.transform ? { transform: node.components.transform } : {}),
        ...(collider ? { collider, ...(data ? { data } : {}) } : {}),
    }, ...(children.length ? { children } : {}) };
}
async function visit(node) {
    const model = Object.values(node.components ?? {}).find(c => c.type === 'Model');
    const filename = model?.properties.filename;
    if (filename?.startsWith('/models/fps/relay-')) {
        if (!cache.has(filename)) {
            const scene = await loadGLBScene(await readFile(new URL(`docs/public${filename}`, root)));
            cache.set(filename, decomposeModelToPrefabNodes(scene).root);
        }
        const prefix = `${node.id}-imported-collision`;
        const collision = prune(cache.get(filename), prefix, node.components?.data);
        const authoredChildren = (node.children ?? []).filter(child => child.id !== `${prefix}-0`);
        if (collision) {
            node.children = [...authoredChildren, collision];
            count++;
        } else if (authoredChildren.length !== (node.children ?? []).length) {
            node.children = authoredChildren;
        }
    }
    // Only authored placements contain Model components; generated children do not.
    for (const child of node.children ?? []) await visit(child);
}
await visit(document.root);
const output = JSON.stringify(document, null, 2) + '\n';
if (process.argv.includes('--check')) {
    if (output !== await readFile(mapPath, 'utf8')) throw new Error('FPS collision data is stale; run node scripts/import-fps-colliders.mjs');
} else await writeFile(mapPath, output);
console.log(`${count} model placements have imported collision data in ${fileURLToPath(mapPath)}`);
