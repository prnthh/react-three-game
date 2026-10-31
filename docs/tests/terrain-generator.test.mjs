import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { generateTile, encodePNG } from '../../scripts/generate-terrain-demo.mjs';

test('terrain generation is repeatable and seed/offset select different samples', () => {
    const options = { seed: 321, offsetX: -32, offsetZ: 64, intervals: 16, tileSize: 32 };
    const tile = generateTile(options);
    assert.deepEqual(generateTile(options), tile);
    assert.notDeepEqual(generateTile({ ...options, seed: 322 }).height, tile.height);
    assert.notDeepEqual(generateTile({ ...options, offsetX: 0 }).height, tile.height);
    for (let i = 0; i < tile.weights.length; i += 3) assert.ok(tile.weights[i] + tile.weights[i + 1] + tile.weights[i + 2] <= 255);
});

test('independently generated height and weight borders match at negative and positive offsets', () => {
    for (const offset of [-320, 0, 320]) {
        const options = { seed: 12345, offsetX: offset, offsetZ: offset, intervals: 32, tileSize: 32 };
        const tile = generateTile(options), east = generateTile({ ...options, offsetX: offset + 32 }), south = generateTile({ ...options, offsetZ: offset + 32 });
        for (const [kind, channels] of [['height', 1], ['weights', 3]]) for (let i = 0; i < tile.size; i++) for (let c = 0; c < channels; c++) {
            assert.equal(tile[kind][(i * tile.size + tile.size - 1) * channels + c], east[kind][i * tile.size * channels + c]);
            assert.equal(tile[kind][((tile.size - 1) * tile.size + i) * channels + c], south[kind][i * channels + c]);
        }
    }
});

test('generated PNG losslessly decodes height and RGB weight samples', () => {
    const tile = generateTile({ intervals: 16 });
    for (const [kind, channels] of [['height', 1], ['weights', 3]]) {
        const png = encodePNG(tile.size, channels, tile[kind]);
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(png.readUInt32BE(16), tile.size);
        const chunks = [];
        for (let offset = 8; offset < png.length;) {
            const length = png.readUInt32BE(offset);
            if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
            offset += length + 12;
        }
        const raw = inflateSync(Buffer.concat(chunks)), decoded = new Uint8Array(tile[kind].length), stride = tile.size * channels;
        for (let row = 0; row < tile.size; row++) {
            assert.equal(raw[row * (stride + 1)], 1);
            for (let x = 0; x < stride; x++) decoded[row * stride + x] = (raw[row * (stride + 1) + 1 + x] + (x >= channels ? decoded[row * stride + x - channels] : 0)) & 255;
        }
        assert.deepEqual(decoded, tile[kind]);
    }
});

test('65-sample maps preserve the 257-sample field at all 64-segment vertices', () => {
    for (const tileSize of [16, 32, 64, 128]) {
        const options = { seed: 71029, offsetX: -tileSize, offsetZ: tileSize, tileSize };
        const fine = generateTile({ ...options, intervals: 256 }), coarse = generateTile({ ...options, intervals: 64 });
        for (let z = 0; z < coarse.size; z++) for (let x = 0; x < coarse.size; x++) {
            assert.equal(coarse.height[z * coarse.size + x], fine.height[z * 4 * fine.size + x * 4]);
            for (let c = 0; c < 3; c++) assert.equal(coarse.weights[(z * coarse.size + x) * 3 + c], fine.weights[(z * 4 * fine.size + x * 4) * 3 + c]);
        }
        const east = generateTile({ ...options, intervals: 64, offsetX: 0 });
        const south = generateTile({ ...options, intervals: 64, offsetZ: tileSize * 2 });
        for (let i = 0; i < coarse.size; i++) for (const [kind, channels] of [['height', 1], ['weights', 3]]) for (let c = 0; c < channels; c++) {
            assert.equal(coarse[kind][(i * coarse.size + coarse.size - 1) * channels + c], east[kind][i * coarse.size * channels + c]);
            assert.equal(coarse[kind][((coarse.size - 1) * coarse.size + i) * channels + c], south[kind][i * channels + c]);
        }
    }
});

import { mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDemo, validateTerrainConfig } from '../../scripts/generate-terrain-demo.mjs';

test('configuration rejects unsupported sizes and undersampled geometry', () => {
    const config = { tileSize: 32, segments: 64, heightIntervals: 64, weightIntervals: 64 };
    for (const patch of [{ tileSize: 0 }, { tileSize: 33 }, { heightIntervals: 32 }, { weightIntervals: 1024 }, { segments: NaN }])
        assert.throws(() => validateTerrainConfig({ ...config, ...patch }));
});

test('generation invalidates stale dimensions, retains seed/offset, and repairs missing maps', () => {
    const destination = mkdtempSync(join(tmpdir(), 'terrain-config-'));
    const config = { tileSize: 32, segments: 32, heightIntervals: 32, weightIntervals: 32 };
    try {
        assert.equal(generateDemo(destination, { seed: 42, offsetX: -64, offsetZ: 32 }, false, config), true);
        assert.equal(generateDemo(destination, undefined, true, config), false);
        const changed = { ...config, tileSize: 64, weightIntervals: 64 };
        assert.equal(generateDemo(destination, undefined, true, changed), true);
        const saved = JSON.parse(readFileSync(join(destination, 'generation.json')));
        assert.deepEqual([saved.seed, saved.offsetX, saved.offsetZ], [42, -64, 32]);
        assert.deepEqual(saved.config, changed);
        assert.equal(readFileSync(join(destination, 'tiles/height-0-0.png')).readUInt32BE(16), 33);
        assert.equal(readFileSync(join(destination, 'tiles/weights-0-0.png')).readUInt32BE(16), 65);
        assert.deepEqual(readFileSync(join(destination, 'height.png')), readFileSync(join(destination, 'tiles/height-0-0.png')));
        unlinkSync(join(destination, 'tiles/weights-9-9.png'));
        assert.equal(generateDemo(destination, undefined, true, changed), true);
        writeFileSync(join(destination, 'generation.json'), JSON.stringify({ ...saved, version: 1 }));
        assert.equal(generateDemo(destination, undefined, true, changed), true);
    } finally { rmSync(destination, { recursive: true, force: true }); }
});
