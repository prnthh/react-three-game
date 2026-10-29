import { PlaneGeometry } from 'three';

export type TerrainLayer = {
    name: string;
    color: string;
    albedoMap: string;
    normalMap: string;
    roughnessMap: string;
    roughness: number;
    tileSize: number;
};
export type TerrainProperties = {
    width?: number;
    depth?: number;
    segments?: number;
    heightScale?: number;
    heightMap?: string;
    weightMap?: string;
    weightResolution?: number;
    layers?: TerrainLayer[];
};
export const DEFAULT_TERRAIN_LAYERS: TerrainLayer[] = [
    { name: 'Grass', color: '#647543', roughness: 0.95, tileSize: 3 },
    { name: 'Dirt', color: '#806348', roughness: 0.9, tileSize: 3 },
    { name: 'Rock', color: '#81858a', roughness: 0.8, tileSize: 4 },
    { name: 'Sand', color: '#c6b38a', roughness: 0.95, tileSize: 3 },
].map(layer => ({ ...layer, albedoMap: '', normalMap: '', roughnessMap: '' }));
export const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
export function terrainSettings(properties: TerrainProperties) {
    return {
        width: bounded(properties.width, 32, 0.1, 10000),
        depth: bounded(properties.depth, 32, 0.1, 10000),
        segments: Math.round(bounded(properties.segments, 128, 1, 512)),
        heightScale: bounded(properties.heightScale, 8, 0, 10000),
        weightResolution: Math.round(bounded(properties.weightResolution, 256, 16, 1024)),
    };
}
export function terrainLayers(layers?: TerrainLayer[]): TerrainLayer[] {
    return DEFAULT_TERRAIN_LAYERS.map((fallback, i) => {
        const layer = { ...fallback, ...layers?.[i] };
        return { ...layer, roughness: bounded(layer.roughness, fallback.roughness, 0, 1),
            tileSize: bounded(layer.tileSize, fallback.tileSize, 0.01, 10000) };
    });
}
export type PixelMap = { width: number; height: number; data: Uint8ClampedArray };

/** Image rows run north to south; Three UV v=1 is the north edge. */
export function sampleHeight(map: PixelMap | null, u: number, v: number) {
    if (!map) return 0;
    const x = Math.max(0, Math.min(1, u)) * (map.width - 1);
    const y = (1 - Math.max(0, Math.min(1, v))) * (map.height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const at = (px: number, py: number) => map.data[(py * map.width + px) * 4] / 255;
    const a = at(x0, y0), b = at(Math.min(x0 + 1, map.width - 1), y0);
    const c = at(x0, Math.min(y0 + 1, map.height - 1));
    const d = at(Math.min(x0 + 1, map.width - 1), Math.min(y0 + 1, map.height - 1));
    return (a + (b - a) * (x - x0)) * (1 - (y - y0)) + (c + (d - c) * (x - x0)) * (y - y0);
}
export function createTerrainGeometry(properties: TerrainProperties, heights: PixelMap | null) {
    const { width, depth, segments, heightScale } = terrainSettings(properties);
    const geometry = new PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position, uvs = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) positions.setY(i, sampleHeight(heights, uvs.getX(i), uvs.getY(i)) * heightScale);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

/** RGB stores layers 0..2, layer 3 is the remainder. Alpha is always opaque:
 * PNG/canvas premultiplication must never destroy weight data. */
export function readWeights(data: Uint8ClampedArray, offset: number): number[] {
    const a = data[offset], b = data[offset + 1], c = data[offset + 2];
    const sum = a + b + c;
    return sum > 255 ? [a / sum, b / sum, c / sum, 0] : [a / 255, b / 255, c / 255, (255 - sum) / 255];
}
export function writeWeights(data: Uint8ClampedArray, offset: number, weights: number[]) {
    const scaled = weights.map(w => Math.max(0, w) * 255);
    const bytes = scaled.map(Math.floor);
    const order = scaled.map((n, i) => ({ i, fraction: n - bytes[i] })).sort((a, b) => b.fraction - a.fraction);
    for (let i = 0, remaining = 255 - bytes.reduce((a, b) => a + b, 0); i < remaining; i++) bytes[order[i % 4].i]++;
    data[offset] = bytes[0]; data[offset + 1] = bytes[1]; data[offset + 2] = bytes[2]; data[offset + 3] = 255;
}
export function normalizeWeightMap(map: PixelMap) {
    for (let i = 0; i < map.data.length; i += 4) writeWeights(map.data, i, readWeights(map.data, i));
}
export type WeightBrush = { u: number; v: number; radius: number; strength: number; hardness: number; layer: number; width: number; depth: number };
export function paintWeights(map: PixelMap, brush: WeightBrush): boolean {
    const { u, v, radius, width, depth, layer } = brush;
    if (!(radius > 0 && width > 0 && depth > 0) || layer < 0 || layer > 3) return false;
    const strength = bounded(brush.strength, 0, 0, 1), hardness = bounded(brush.hardness, 0.5, 0, 0.99);
    const cx = u * (map.width - 1), cy = (1 - v) * (map.height - 1);
    const rx = radius / width * (map.width - 1), ry = radius / depth * (map.height - 1);
    let changed = false;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(map.height - 1, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(map.width - 1, Math.ceil(cx + rx)); x++) {
            const distance = Math.hypot((x - cx) / rx, (y - cy) / ry);
            if (distance >= 1) continue;
            const t = Math.max(0, (distance - hardness) / (1 - hardness));
            const amount = strength * (1 - t * t * (3 - 2 * t));
            const offset = (y * map.width + x) * 4, weights = readWeights(map.data, offset);
            const previous = [map.data[offset], map.data[offset + 1], map.data[offset + 2]];
            writeWeights(map.data, offset, weights.map((w, i) => w * (1 - amount) + (i === layer ? amount : 0)));
            changed ||= previous.some((w, i) => w !== map.data[offset + i]);
        }
    }
    return changed;
}
