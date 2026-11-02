import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { disposeAfterPrefabCompilation, registerPrefabCompilationContext } from '../rendering/compileInSlices.js';
import { registerSceneCaptureRenderer, renderToScreen } from '../rendering/sceneCapture.js';
import { RenderPipeline, type Node, type WebGPURenderer } from "three/webgpu";
import { emissive, mrt, normalView, output, pass, vec3, vec4 } from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

export type PostProcessingProperties = {
    ambientOcclusion: boolean;
    ambientOcclusionIntensity: number;
    ambientOcclusionRadius: number;
    ambientOcclusionResolutionScale: number;
    ambientOcclusionSamples: number;
    bloom: boolean;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
};

function PostProcessing({
    ambientOcclusion,
    ambientOcclusionIntensity,
    ambientOcclusionRadius,
    ambientOcclusionResolutionScale,
    ambientOcclusionSamples,
    bloom: bloomEnabled,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
}: PostProcessingProperties) {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    const scene = useThree(state => state.scene);
    const camera = useThree(state => state.camera);
    const { pipeline, scenePass, dispose } = useMemo(() => {
        const value = new RenderPipeline(renderer);
        // r186 GTAO uses textureGather, which cannot read multisampled depth.
        // https://github.com/mrdoob/three.js/issues/34598
        const scenePass = pass(scene, camera, ambientOcclusion ? { samples: 0 } : {});
        const owned: { dispose(): void }[] = [value, scenePass];
        scenePass.setMRT(mrt({ output, normal: normalView, emissive }));
        let outputNode: Node<"vec4"> = scenePass.getTextureNode("output");
        if (ambientOcclusion) {
            const aoPass = ao(scenePass.getTextureNode("depth"), scenePass.getTextureNode("normal"), camera);
            owned.push(aoPass);
            aoPass.resolutionScale = Math.max(0.1, Math.min(1, ambientOcclusionResolutionScale));
            aoPass.radius.value = Math.max(0.001, ambientOcclusionRadius);
            aoPass.samples.value = Math.max(1, Math.round(ambientOcclusionSamples));
            const intensity = Math.max(0, Math.min(1, ambientOcclusionIntensity));
            const factor = aoPass.getTextureNode().r.mul(intensity).add(1 - intensity);
            outputNode = outputNode.mul(vec4(vec3(factor), 1));
        }
        if (bloomEnabled) {
            const bloomPass = bloom(
                scenePass.getTextureNode("emissive"),
                Math.max(0, bloomStrength),
                Math.max(0, Math.min(1, bloomRadius)),
                Math.max(0, bloomThreshold),
            );
            owned.push(bloomPass);
            outputNode = outputNode.add(bloomPass);
        }
        // GTAO requires single-sample depth, so restore edge smoothing after composition.
        value.outputNode = ambientOcclusion ? fxaa(outputNode) : outputNode;
        return { pipeline: value, scenePass, dispose: () => { for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); } };
    }, [ambientOcclusion, ambientOcclusionIntensity, ambientOcclusionRadius, ambientOcclusionResolutionScale, ambientOcclusionSamples, bloomEnabled, bloomRadius, bloomStrength, bloomThreshold, camera, renderer, scene]);
    useEffect(() => () => disposeAfterPrefabCompilation(renderer, dispose), [renderer, dispose]);
    const renderFinalFrame = useMemo(() => () => renderToScreen(renderer, () => pipeline.render()), [renderer, pipeline]);
    useLayoutEffect(() => registerSceneCaptureRenderer(renderer, renderFinalFrame), [renderer, renderFinalFrame]);
    useLayoutEffect(() => registerPrefabCompilationContext(renderer, () => {
        const target = renderer.getRenderTarget(), targets = renderer.getMRT();
        renderer.setRenderTarget(scenePass.renderTarget);
        renderer.setMRT(scenePass.getMRT());
        return () => { renderer.setRenderTarget(target); renderer.setMRT(targets); };
    }), [renderer, scenePass]);
    useFrame(renderFinalFrame, 1);
    return null;
}

function PostProcessingView({ properties, children }: ComponentViewProps<PostProcessingProperties>) {
    return <>{(properties.ambientOcclusion || properties.bloom) && <PostProcessing {...properties} />}{children}</>;
}
const PostProcessingComponent: Component<PostProcessingProperties> = {
    name: 'PostProcessing', scope: 'scene', exclusive: 'postprocessing', category: 'lighting', View: PostProcessingView,
    description: 'Optional scene-root ambient occlusion and emissive bloom. No effect pass is mounted unless an effect is enabled. Used by the viewer, editor and scene captures.',
    properties: {
        ambientOcclusion: { type: 'boolean', default: false },
        ambientOcclusionIntensity: { default: 0.65, min: 0, max: 1, step: 0.05 },
        ambientOcclusionRadius: { default: 0.25, min: 0.001, step: 0.1 },
        ambientOcclusionResolutionScale: { default: 0.5, min: 0.1, max: 1, step: 0.1 },
        ambientOcclusionSamples: { default: 8, min: 1, max: 64, step: 1 },
        bloom: { type: 'boolean', default: false },
        bloomStrength: { default: 0.25, min: 0, max: 5, step: 0.05 },
        bloomRadius: { default: 0.35, min: 0, max: 1, step: 0.05 },
        bloomThreshold: { default: 0.9, min: 0, step: 0.1 },
    },
};
export default PostProcessingComponent;
