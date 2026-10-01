// One-shot, loopback-only exportJSON receiver for a local editor session.
// Usage: node scripts/receive-editor-scene.mjs <destination.json> <editor-origin>
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const [destination, editorOrigin] = process.argv.slice(2);
if (!destination || !editorOrigin) throw new Error('Pass a destination JSON file and exact editor origin.');
const origin = new URL(editorOrigin).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local editor origins only.');
const file = resolve(destination);
const original = await readFile(file);
const originalHash = createHash('sha256').update(original).digest('hex');
const token = randomBytes(24).toString('hex');
let saving = false;
const server = createServer(async (request, response) => {
    if (request.headers.origin !== origin || request.url !== `/${token}`) {
        response.writeHead(403).end(); return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'POST');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.writeHead(204).end(); return;
    }
    if (request.method !== 'POST' || saving) { response.writeHead(409).end(); return; }
    saving = true;
    try {
        const chunks = []; let size = 0;
        for await (const chunk of request) {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) throw new Error('Scene exceeds 8 MiB.');
            chunks.push(chunk);
        }
        const prefab = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const ids = new Set();
        const visit = (node) => {
            if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id)) throw new Error('Invalid or duplicate node ID.');
            ids.add(node.id);
            if (node.children !== undefined && !Array.isArray(node.children)) throw new Error('Invalid children.');
            for (const child of node.children ?? []) visit(child);
        };
        visit(prefab.root);
        const latest = await readFile(file);
        if (createHash('sha256').update(latest).digest('hex') !== originalHash) throw new Error('Destination changed since receiver started; inspect and retry.');
        const backup = `${file}.${Date.now()}.before-agent-save`;
        await writeFile(backup, original, { flag: 'wx' });
        const serialized = JSON.stringify(prefab, null, 2) + '\n';
        const temporary = `${file}.${token}.tmp`;
        await writeFile(temporary, serialized, { flag: 'wx' });
        await rename(temporary, file);
        const sha256 = createHash('sha256').update(serialized).digest('hex');
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ saved: file, backup, nodeCount: ids.size, sha256 }));
        console.log(JSON.stringify({ saved: file, backup, nodeCount: ids.size, sha256 }));
        server.close();
    } catch (error) {
        saving = false;
        response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(error) }));
    }
});
server.listen(0, '127.0.0.1', () => {
    console.log(JSON.stringify({ endpoint: `http://127.0.0.1:${server.address().port}/${token}`, origin, destination: file }));
});
setTimeout(() => server.close(), 10 * 60 * 1000).unref();
