/** Dependency-free, deterministic terrain PNG generation. Offsets are world units. */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { parseArgs } from 'node:util';

export const DEFAULTS = { seed: 71029, offsetX: 0, offsetZ: 0 };
const VERSION = 1, GRID = 10, INTERVALS = 256, TILE_SIZE = 32, HEIGHT_SCALE = 48;
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(x, z, seed) {
    let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z, seed) {
    const ix = Math.floor(x), iz = Math.floor(z), u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
    const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function sampleHeight(x, z, seed = DEFAULTS.seed) {
    const macro = noise(x / 64, z / 64, seed);
    const detail = .55 * noise(x / 27, z / 27, seed + 1) + .28 * noise(x / 11, z / 11, seed + 2)
        + .12 * noise(x / 5, z / 5, seed + 3) + .05 * noise(x / 2.3, z / 2.3, seed + 4);
    const ridge = (1 - Math.abs(2 * macro - 1)) ** 2;
    const band = Math.exp(-(((x / 320 - .66 - .10 * Math.sin(z / 320 * 7)) / .30) ** 2));
    const river = Math.abs(x / 320 - (.30 + .095 * Math.sin(z / 320 * 8 + .4) + .025 * Math.sin(z / 320 * 24)));
    const valley = smooth(.015, .105, river);
    return Math.max(0, Math.min(48, (1.2 + 1.5 * detail) * (1 - valley) + (3 + 30 * ridge * band + 8 * detail) * valley));
}
export function generateTile({ seed = DEFAULTS.seed, offsetX = 0, offsetZ = 0, intervals = INTERVALS, tileSize = TILE_SIZE } = {}) {
    const size = intervals + 1, padded = size + 2, step = tileSize / intervals;
    const heights = new Float64Array(padded * padded);
    // A halo gives identical centered slope samples on both sides of every seam.
    for (let z = -1; z <= size; z++) for (let x = -1; x <= size; x++)
        heights[(z + 1) * padded + x + 1] = sampleHeight(offsetX + x * step, offsetZ + z * step, seed);
    const height = new Uint8Array(size * size), weights = new Uint8Array(size * size * 3);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        const p = (z + 1) * padded + x + 1, i = z * size + x, h = heights[p];
        const slope = Math.hypot(heights[p + 1] - heights[p - 1], heights[p + padded] - heights[p - padded]) / (2 * step);
        const rock = Math.max(smooth(.35, .95, slope), .8 * smooth(24, 36, h));
        const sand = (1 - smooth(3, 7, h)) * (1 - rock);
        const dirt = (.18 + .45 * smooth(.2, .65, slope)) * (1 - rock) * (1 - sand);
        const grass = Math.max(0, 1 - rock - sand - dirt), total = grass + dirt + rock + sand;
        height[i] = Math.round(h / HEIGHT_SCALE * 255);
        weights.set([Math.floor(grass / total * 255), Math.floor(dirt / total * 255), Math.floor(rock / total * 255)], i * 3);
    }
    return { size, height, weights };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
    let c = i; for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function chunk(type, data) {
    const name = Buffer.from(type), bytes = Buffer.concat([name, data]);
    let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); bytes.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
}
export function encodePNG(size, channels, pixels) {
    const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = channels === 1 ? 0 : 2;
    const stride = size * channels, scanlines = Buffer.alloc((stride + 1) * size);
    for (let row = 0; row < size; row++) {
        // PNG Sub filter improves compression without a native image dependency.
        const start = row * (stride + 1); scanlines[start] = 1;
        for (let x = 0; x < stride; x++) scanlines[start + x + 1] = (pixels[row * stride + x] - (x >= channels ? pixels[row * stride + x - channels] : 0)) & 255;
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
export function generateDemo(destination, options = DEFAULTS, ensure = false) {
    const stamp = join(destination, 'generation.json');
    const paths = ['height.png', 'weights.png'];
    for (let row = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) for (const kind of ['height', 'weights']) paths.push(`tiles/${kind}-${row}-${col}.png`);
    if (ensure && existsSync(stamp)) {
        let saved;
        try { saved = JSON.parse(readFileSync(stamp, 'utf8')); } catch { /* Rebuild interrupted output. */ }
        if (saved && Number.isInteger(saved.seed) && Number.isFinite(saved.offsetX) && Number.isFinite(saved.offsetZ)) {
            options = { seed: saved.seed, offsetX: saved.offsetX, offsetZ: saved.offsetZ };
            if (saved.version === VERSION && paths.every(p => existsSync(join(destination, p)))) return false;
        }
    }
    mkdirSync(join(destination, 'tiles'), { recursive: true });
    for (let row = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) {
        const tile = generateTile({ ...options, offsetX: options.offsetX + col * TILE_SIZE, offsetZ: options.offsetZ + row * TILE_SIZE });
        for (const [kind, channels, pixels] of [['height', 1, tile.height], ['weights', 3, tile.weights]]) {
            const png = encodePNG(tile.size, channels, pixels);
            writeFileSync(join(destination, `tiles/${kind}-${row}-${col}.png`), png);
            if (row === 0 && col === 0) writeFileSync(join(destination, `${kind}.png`), png);
        }
    }
    writeFileSync(stamp, JSON.stringify({ version: VERSION, ...options }, null, 2) + '\n');
    return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { values } = parseArgs({ options: { seed: { type: 'string' }, 'offset-x': { type: 'string' }, 'offset-z': { type: 'string' }, ensure: { type: 'boolean' } } });
    const options = { seed: Number(values.seed ?? DEFAULTS.seed), offsetX: Number(values['offset-x'] ?? 0), offsetZ: Number(values['offset-z'] ?? 0) };
    if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff || !Number.isFinite(options.offsetX) || !Number.isFinite(options.offsetZ)) throw new Error('Seed must be uint32; offsets must be finite world coordinates.');
    const destination = resolve(fileURLToPath(new URL('../docs/public/textures/terrain-demo/', import.meta.url)));
    const changed = generateDemo(destination, options, values.ensure && values.seed === undefined && values['offset-x'] === undefined && values['offset-z'] === undefined);
    const generated = JSON.parse(readFileSync(join(destination, 'generation.json'), 'utf8'));
    console.log(changed ? `Generated 100 terrain pairs: seed ${generated.seed}, offset (${generated.offsetX}, ${generated.offsetZ}).` : 'Terrain maps already generated; retaining local seed and offset.');
}
