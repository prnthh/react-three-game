import { Vector3, Vector2, type Texture } from 'three';
import { GRASS_TRAIL_RECOVERY } from '../terrain';
import { SpriteNodeMaterial } from 'three/webgpu';
import { attribute, float, hash, instanceIndex, mix, sin, smoothstep, step, texture, uniform, uv, vec2, vec3 } from 'three/tsl';
export function createVegetationUniforms() {
    return { playerPosition: uniform(new Vector3(0, -1000, 0)), clock: uniform(0) };
}
type GrassUniforms = ReturnType<typeof createVegetationUniforms>;

// Keep the original demo's billboard blades, palette, wind layers and contact shadow.
// Positions and trail timestamps come from each chunk, rather than a wrapping heightmap.
export function createGrassMaterial(noiseAtlas: Texture, { playerPosition, clock }: GrassUniforms) {
    const material = new SpriteNodeMaterial();
    const root = attribute<'vec3'>('plantRoot', 'vec3');
    const localRoot = attribute<'vec3'>('plantLocal', 'vec3');
    const lastStepped = attribute<'float'>('lastStepped', 'float');
    const noise = texture(noiseAtlas, root.xz.mul(0.01));
    const positionNoise = noise.g;
    const originalScale = noise.b.pow(2).remap(0, 1, 0.75, 2);
    // Recover at the original ~30 Hz compute rate, independently of frame rate.
    const recovery = clock.sub(lastStepped).max(0).mul(-GRASS_TRAIL_RECOVERY).exp();
    const scaleY = mix(originalScale, float(0.25), recovery);
    const h = uv().y;
    const bendProfile = h.pow(2).mul(2);
    material.scaleNode = vec3(positionNoise.remap(0, 1, 0.5, 1.5), scaleY, 1);
    const instanceNoise = hash(instanceIndex.add(196.4356)).sub(0.5).mul(0.25);
    material.rotationNode = vec3(positionNoise.sub(0.5).mul(0.25).add(instanceNoise).mul(bendProfile), 0, 0);

    const windDirection = vec2(new Vector2(0.7, 0.3).normalize());
    const direction = windDirection.negate();
    const speed = positionNoise.remap(0, 1, 0.95, 2.05).mul(0.25);
    const windUV = root.xz.mul(0.0175);
    const scroll = direction.mul(speed).mul(clock);
    const a = texture(noiseAtlas, windUV.add(scroll)).mul(2).sub(1);
    const b = texture(noiseAtlas, windUV.mul(1.37).add(scroll.mul(1.11))).mul(2).sub(1);
    const blend = sin(positionNoise.mul(12.9898)).mul(78.233).fract()
        .add(sin(clock.mul(0.4).add(positionNoise.mul(0.1))).mul(0.25)).clamp(0.2, 0.8);
    const wind = mix(a, b, blend);
    const windFactor = wind.r.add(wind.g.mul(0.35)).mul(0.708);
    const windXZ = direction.mul(windFactor);
    const swayFactor = h.mul(windFactor);
    const sway = sin(clock.mul(5).add(positionNoise.mul(Math.PI * 2))).mul(0.15).mul(swayFactor);
    const flutter = sin(clock.mul(0.425).add(hash(instanceIndex).mul(Math.PI * 2 * 1.3)))
        .mul(0.06).mul(bendProfile);
    const windOffset = vec3(windXZ.x, float(1).sub(h.pow(2)).mul(0.07), windXZ.y).mul(bendProfile);
    material.positionNode = localRoot.add(sway)
        .add(vec3(windDirection.y.negate(), 0, windDirection.x).mul(flutter)).add(windOffset);

    const distanceSquared = root.xz.sub(playerPosition.xz).lengthSq();
    const near = smoothstep(0, 625, distanceSquared).oneMinus();
    const rim = smoothstep(-5, 5, uv().x.mul(2).sub(1).abs());
    const ao = float(1).sub(near.mul(rim).mul(smoothstep(0.1, 0.85, h).oneMinus()).mul(0.125));
    const jitter = smoothstep(0, 2.75, positionNoise);
    const base = vec3(0.55, 0.42, 0.19).mul(jitter);
    const tip = vec3(0.29, 0.47, 0.04);
    const baseToTip = mix(base, tip, h.mul(0.125));
    const windAo = mix(1, 0.25, smoothstep(0, 1, h).oneMinus().mul(smoothstep(0, 1, swayFactor)));
    // Sun direction is (-1,-1,-1); project the ball onto each blade's ground plane.
    const height = playerPosition.y.sub(root.y);
    const shadowCenter = playerPosition.xz.sub(vec2(height));
    const shadow = smoothstep(0.125, 0.5, root.xz.sub(shadowCenter).lengthSq());
    const shadowFactor = mix(shadow, float(1), smoothstep(2, 8, height.sub(0.5)));
    material.colorNode = mix(baseToTip.mul(0.5), baseToTip, shadowFactor).mul(windAo).mul(ao);
    material.forceSinglePass = true;
    return material;
}

export function createFlowerMaterial(map: Texture, { clock }: GrassUniforms) {
    const material = new SpriteNodeMaterial({ alphaTest: 0.15 });
    const root = attribute<'vec3'>('plantLocal', 'vec3');
    const r1 = hash(instanceIndex.add(9234)), r2 = hash(instanceIndex.add(33.87));
    const sway = vec3(sin(clock.add(r1.mul(100))).mul(0.25), r2.mul(0.5), sin(clock.mul(2).add(r2.mul(33.76))).mul(0.15));
    material.positionNode = root.add(vec3(0, r1.add(r2).add(0.25).clamp(), 0)).add(sway);
    material.scaleNode = vec3(r1.remap(0, 1, 0.125, 0.2));
    const flower = texture(map, uv());
    const tint = mix(vec3(0.02, 0.14, 0.33), vec3(0.99, 0.64, 0), r2);
    const sign = step(r2, r1).mul(2).sub(1);
    material.colorNode = mix(tint, flower.rgb, r1.add(r2.mul(sign))).mul(0.275);
    material.opacityNode = flower.a;
    return material;
}
