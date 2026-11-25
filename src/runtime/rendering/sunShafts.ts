import { HalfFloatType, RGFormat, type Camera, type DepthTexture, type DirectionalLight, type DirectionalLightShadow, type Node, type TextureNode } from 'three/webgpu';
import { Fn, Loop, float, getViewPosition, interleavedGradientNoise, int, ivec2, mix, rtt, screenCoordinate, texture, textureSize, uniform, uv, vec2, vec4 } from 'three/tsl';

/** Integrate only the air between the near plane and the first opaque surface.
 * The nearest sun cascade owns the shadow texture and its live projection. */
export function createSunShafts(depth: TextureNode, camera: Camera, light: DirectionalLight, shadow: DirectionalLightShadow, map: DepthTexture) {
    const projectionInverse = uniform(camera.projectionMatrixInverse);
    const world = uniform(camera.matrixWorld);
    const shadowMatrix = uniform(shadow.matrix);
    const maxDistance = uniform(40);
    const lightStrength = uniform(0);
    const color = uniform(light.color);
    const options = { type: HalfFloatType, format: RGFormat, depthBuffer: false, resolutionScale: 0.25 };
    const samples = 16;
    const shafts = rtt(Fn(() => {
        const surface = getViewPosition(uv(), depth.sample(uv()).r, projectionInverse).toVar();
        const start = getViewPosition(uv(), float(0), projectionInverse).toVar();
        const ray = surface.sub(start).toVar();
        const length = ray.length().min(maxDistance).toVar();
        // Orthographic shadow coordinates are affine, so transform the endpoints once.
        const origin = shadowMatrix.mul(world.mul(vec4(start, 1))).xyz.toVar();
        const step = shadowMatrix.mul(world.mul(vec4(ray.div(ray.length().max(0.0001)), 0))).xyz.mul(length.div(samples)).toVar();
        const jitter = interleavedGradientNoise(screenCoordinate.xy);
        const visibility = float(0).toVar();
        Loop(samples, ({ i }) => {
            const t = float(i).add(jitter).toVar();
            const p = origin.add(step.mul(t)).toVar();
            const border = p.min(p.oneMinus()).toVar();
            const inside = border.x.min(border.y).min(border.z).smoothstep(0, 0.015);
            const fade = length.mul(t).div(maxDistance.mul(samples)).smoothstep(0.75, 1).oneMinus();
            const lit = texture(map, vec2(p.x, p.y.oneMinus())).compare(p.z) as Node<'float'>;
            visibility.addAssign(lit.mul(inside).mul(fade));
        });
        return vec4(visibility.mul(length).div(samples), surface.z.negate().min(65000), 0, 1);
    })(), null, null, options);
    // Use the depth stored beside each low-resolution sample to reject taps
    // across silhouettes without another full-resolution geometry pass.
    function composite(base: Node<'vec4'>) {
        return Fn(() => {
            const z = getViewPosition(uv(), depth.sample(uv()).r, projectionInverse).z.negate().toVar();
            const size = vec2(textureSize(shafts, int(0)) as unknown as Node<'uvec2'>).toVar();
            const pixel = uv().mul(size).sub(0.5).toVar();
            const lit = float(0).toVar(), total = float(0).toVar();
            for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                const texel = pixel.floor().add(vec2(x, y)).toVar();
                const sample = shafts.load(ivec2(texel.clamp(vec2(0), size.sub(1)))).rg.toVar();
                const w = texel.sub(pixel).abs().oneMinus().toVar();
                const weight = w.x.mul(w.y).div(sample.y.sub(z).abs().div(z.mul(0.02).add(0.1)).add(1).pow(2)).toVar();
                lit.addAssign(weight.mul(sample.x));
                total.addAssign(weight);
            }
            const amount = lit.div(total.max(0.001)).mul(lightStrength).negate().exp().oneMinus();
            return vec4(mix(base.rgb, color, amount), base.a);
        })();
    }
    return { composite, maxDistance, lightStrength, dispose: () => shafts.dispose() };
}
