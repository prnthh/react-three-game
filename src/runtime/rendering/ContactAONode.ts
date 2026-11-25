import { Node, NodeMaterial, QuadMesh, RedFormat, RendererUtils, RenderTarget, Vector2, type Camera, type NodeFrame, type TextureNode } from 'three/webgpu';
import { Fn, If, Loop, NodeUpdateType, PI, cos, dot, float, getScreenPosition, getViewPosition, int, interleavedGradientNoise, ivec2, passTexture, screenCoordinate, sin, textureSize, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';

const size = new Vector2();

export class ContactAONode extends Node<'vec4'> {
    private target = new RenderTarget(1, 1, { depthBuffer: false, format: RedFormat });
    private material = new NodeMaterial();
    private quad = new QuadMesh(this.material);
    private state = {} as Parameters<typeof RendererUtils.restoreRendererState>[1];
    // PassTextureNode accepts any render node at runtime, including Three's GTAONode.
    readonly texture: TextureNode = passTexture(this as unknown as Parameters<typeof passTexture>[0], this.target.texture);

    constructor(depth: TextureNode, normals: TextureNode, camera: Camera, radius: number, private resolution: number, samples: number) {
        super('vec4');
        this.quad.name = 'Contact AO';
        this.updateBeforeType = NodeUpdateType.FRAME;
        const projection = uniform(camera.projectionMatrix);
        const inverse = uniform(camera.projectionMatrixInverse);
        const taps = Math.min(4, samples);
        this.material.fragmentNode = Fn(() => {
            const center = uv();
            const dimensions = vec2(textureSize(depth, int(0)) as unknown as Node<'uvec2'>).toVar();
            const d = depth.load(ivec2(center.mul(dimensions))).r.toVar();
            const amount = float(0).toVar();
            // The game renderer uses ordinary depth; the cleared far plane is 1.
            If(d.lessThan(1), () => {
                const position = getViewPosition(center, d, inverse).toVar();
                const normal = normals.sample(center).xyz.normalize().toVar();
                const extent = getScreenPosition(position.add(vec3(radius, -radius, 0)), projection).sub(center).abs().toVar();
                const rotation = interleavedGradientNoise(screenCoordinate.xy).mul(PI.mul(2)).toVar();
                const direction = vec2(cos(rotation), sin(rotation)).toVar();
                Loop(taps, ({ i }) => {
                    const spread = float(i).add(0.5).div(taps).sqrt();
                    const texel = center.add(direction.mul(extent).mul(spread)).mul(dimensions).floor().clamp(vec2(0), dimensions.sub(1)).toVar();
                    const sampleUV = texel.add(0.5).div(dimensions);
                    const sampleDepth = depth.load(ivec2(texel)).r;
                    const delta = getViewPosition(sampleUV, sampleDepth, inverse).sub(position).toVar();
                    const distanceSquared = dot(delta, delta).max(0.0001).toVar();
                    const facing = dot(normal, delta).div(distanceSquared.sqrt()).sub(0.06).max(0);
                    const weight = distanceSquared.div(radius * radius).oneMinus().saturate();
                    amount.addAssign(facing.mul(weight));
                    direction.assign(vec2(direction.y.negate(), direction.x));
                });
            });
            return vec4(amount.mul(3.2 / taps).saturate().oneMinus(), 0, 0, 1);
        })();
    }

    override updateBefore({ renderer }: NodeFrame) {
        if (!renderer) return undefined;
        renderer.getDrawingBufferSize(size);
        this.target.setSize(Math.max(1, Math.round(size.x * this.resolution)), Math.max(1, Math.round(size.y * this.resolution)));
        RendererUtils.resetRendererState(renderer, this.state);
        try {
            renderer.setRenderTarget(this.target);
            this.quad.render(renderer);
        } finally {
            RendererUtils.restoreRendererState(renderer, this.state);
        }
        return undefined;
    }

    override dispose() {
        this.target.dispose();
        this.material.dispose();
        super.dispose();
    }
}
