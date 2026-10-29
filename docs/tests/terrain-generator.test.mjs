import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { generateTile, encodePNG } from '../../scripts/generate-terrain-demo.mjs';

test('terrain generation is repeatable and seed/offset select different samples', () => {
    const options = { seed: 321, offsetX: -32, offsetZ: 64, intervals: 16 };
    const tile = generateTile(options);
    assert.deepEqual(generateTile(options), tile);
    assert.notDeepEqual(generateTile({ ...options, seed: 322 }).height, tile.height);
    assert.notDeepEqual(generateTile({ ...options, offsetX: 0 }).height, tile.height);
    for (let i = 0; i < tile.weights.length; i += 3) assert.ok(tile.weights[i] + tile.weights[i + 1] + tile.weights[i + 2] <= 255);
});

test('independently generated height and weight borders match at negative and positive offsets', () => {
    for (const offset of [-320, 0, 320]) {
        const options = { seed: 12345, offsetX: offset, offsetZ: offset, intervals: 32 };
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
