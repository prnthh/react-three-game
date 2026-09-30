// Shared by rendering, collision meshes, and deterministic vegetation placement.
export const TERRAIN_SEGMENTS = 12;

export function terrainHeight(x: number, z: number) {
    const broad = Math.sin(x * 0.045) * 1.15 + Math.cos(z * 0.04) * 0.9;
    const crossing = Math.sin((x + z) * 0.08) * 0.45 + Math.cos((x - z) * 0.065) * 0.32;
    const detail = Math.sin(x * 0.19 + Math.cos(z * 0.12)) * 0.14;
    const shore = -2.2 + 3.6 / (1 + Math.exp(-(x + 17) * 0.26));
    return shore + broad + crossing + detail;
}

// Interpolate the same triangles as PlaneGeometry so plants sit on the visible mesh.
export function surfaceHeight(x: number, z: number, chunkSize: number, heightAt: typeof terrainHeight) {
    const cell = chunkSize / TERRAIN_SEGMENTS;
    const gx = Math.floor((x + chunkSize / 2) / cell);
    const gz = Math.floor((z + chunkSize / 2) / cell);
    const x0 = gx * cell - chunkSize / 2;
    const z0 = gz * cell - chunkSize / 2;
    const u = (x - x0) / cell;
    const v = (z - z0) / cell;
    const a = heightAt(x0, z0), b = heightAt(x0 + cell, z0);
    const c = heightAt(x0, z0 + cell), d = heightAt(x0 + cell, z0 + cell);
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}

export function vegetationPlacements(x: number, z: number, chunkSize: number, count: number,
    heightAt: typeof terrainHeight, waterLevel: number, clearance: number, transition: number) {
    let seed = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ count) >>> 0;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const placements = [];
    for (let i = 0; i < count; i++) {
        const px = (random() - 0.5) * chunkSize;
        const pz = (random() - 0.5) * chunkSize;
        const y = surfaceHeight(x * chunkSize + px, z * chunkSize + pz, chunkSize, heightAt);
        const t = Math.max(0, Math.min(1, (y - waterLevel - clearance) / Math.max(transition, 0.0001)));
        const keep = random(), rotation = random() * Math.PI * 2, scale = 0.65 + random() * 0.7;
        if (keep < t * t * (3 - 2 * t)) placements.push({ x: px, y, z: pz, rotation, scale });
    }
    return placements;
}

export const GRASS_TRAIL_RECOVERY = -Math.log(0.96) * 30;

// Only contact stamps change on the CPU; the shader handles gradual regrowth.
export function stampGrassTrail(plants: { x: number; y: number; z: number }[], stamps: Float32Array,
    x: number, y: number, z: number, time: number) {
    let changed = false;
    for (let i = 0; i < plants.length; i++) {
        const plant = plants[i], dx = plant.x - x, dz = plant.z - z;
        const height = y - plant.y;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared < 1 && height >= 0 && height < 1) {
            const t = Math.max(0, (distanceSquared - 0.35) / 0.65);
            const contact = 1 - t * t * (3 - 2 * t);
            // Encode softer edge contact as an older stamp; never erase a deeper footprint.
            const stamp = time + Math.log(contact) / GRASS_TRAIL_RECOVERY;
            if (stamp > stamps[i]) { stamps[i] = stamp; changed = true; }
        }
    }
    return changed;
}
