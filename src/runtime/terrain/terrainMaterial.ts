import { retainTerrainSampler } from './terrainResources.js';
import { Color, type Texture } from 'three';
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import { color, float, mix, normalMap, positionLocal, texture, uv, vec2, vec3, vec4 } from 'three/tsl';
import type { TerrainLayer } from './terrainData.js';
import type { createWeightSurface } from './terrainSurface.js';

export type LayerTextures = { albedo: Texture | null; normal: Texture | null; roughness: Texture | null; displacement?: Texture | null };
export function createTerrainMaterial(layers: TerrainLayer[], maps: LayerTextures[], surface: ReturnType<typeof createWeightSurface>, width: number, depth: number) {
    const releases: (() => void)[] = [];
    function tile(source: Texture, srgb = false) {
        const sampler = retainTerrainSampler(source, srgb);
        releases.push(sampler.release);
        return sampler.texture;
    }
    const material = new MeshStandardNodeMaterial();
    material.name = 'Terrain / four material weights';
    const rgb = texture(surface.texture, uv()).rgb;
    const total = rgb.r.add(rgb.g).add(rgb.b);
    const weights = vec4(rgb, float(1).sub(total).max(0)).div(total.max(1));
    let displacement: Node<'float'> = float(0);
    let albedo: Node<'vec3'> = vec3(0), roughness: Node<'float'> = float(0), normals: Node<'vec3'> = vec3(0);
    for (let i = 0; i < 4; i++) {
        const layer = layers[i], source = maps[i], weight = [weights.r, weights.g, weights.b, weights.a][i];
        const coords = uv().mul(vec2(width / layer.tileSize, depth / layer.tileSize));
        const tint = color(new Color(layer.color));
        const base = source.albedo ? texture(tile(source.albedo, true), coords).rgb.mul(tint) : tint;
        const rough = source.roughness ? texture(tile(source.roughness), coords).r.mul(layer.roughness) : float(layer.roughness);
        const normal = source.normal ? texture(tile(source.normal), coords).rgb : vec3(0.5, 0.5, 1);
        albedo = albedo.add(base.mul(weight));
        roughness = roughness.add(rough.mul(weight));
        normals = normals.add(normal.mul(weight));
        if (source.displacement && layer.displacementScale) {
            const height = texture(tile(source.displacement), coords).r.sub(0.5);
            displacement = displacement.add(height.mul(layer.displacementScale).mul(weight));
        }
    }
    material.positionNode = positionLocal.add(vec3(0, displacement, 0));
    material.colorNode = albedo;
    material.roughnessNode = roughness.clamp(0.04, 1);
    material.normalNode = normalMap(normals);
    // Editor-only uniforms default to invisible; ring follows the actual terrain surface.
    const distance = uv().sub(surface.brushCenter).div(surface.brushRadius).length();
    const ring = float(1).sub(distance.sub(1).abs().smoothstep(0.015, 0.055)).mul(surface.brushVisible);
    material.emissiveNode = mix(vec3(0), vec3(0.7, 0.85, 1), ring);
    material.addEventListener('dispose', () => releases.forEach(release => release()));
    return material;
}
